import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { VerificationTraceObserver } from '../../verification-trace/verification-trace-observer'
import { BatchJobStep } from '../../../domain/batch-job'
import { BatchJobHandle, BatchJobs } from './batch-jobs'
import { BatchResultReader } from './batch-result-reader'
import { BatchAdmissionStore } from './batch-admission-store'
import { BatchEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { BatchEmailVerificationService } from './batch-email-verification.service'

function handle(overrides: Partial<BatchJobHandle> & Pick<BatchJobHandle, 'data'>): BatchJobHandle {
    return {
        id: 'job-1',
        queueQualifiedName: 'bull:batch-email-verification',
        attemptsMade: 0,
        readStatus: jest.fn().mockResolvedValue({ state: 'running' }),
        counts: jest.fn().mockResolvedValue({ processed: 0, unprocessed: 0 }),
        updateStep: jest.fn(),
        ...overrides,
    }
}

describe('BatchEmailVerificationService', () => {
    let traceObserver: jest.Mocked<VerificationTraceObserver>
    let jobs: jest.Mocked<BatchJobs>
    let resultReader: jest.Mocked<BatchResultReader>
    let admissions: jest.Mocked<BatchAdmissionStore>
    let service: BatchEmailVerificationService

    const organizationId = 'org-1'
    const otherOrganizationId = 'org-2'

    beforeEach(() => {
        traceObserver = {
            enqueued: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            batchCompleted: jest.fn(),
        }
        jobs = { enqueue: jest.fn(), find: jest.fn() }
        resultReader = { read: jest.fn() }
        admissions = {
            createOrReplay: jest.fn(),
            findById: jest.fn().mockResolvedValue(null),
            findByClientKey: jest.fn(),
            updateState: jest.fn(),
            insertUniqueAddresses: jest.fn(),
            pageUniqueAddresses: jest.fn(),
            recordAdmissionOutcome: jest.fn(),
            ensurePayerRequestId: jest.fn(),
            countUnsettledAddresses: jest.fn(),
            getStatusCounts: jest.fn(),
        }
        service = new BatchEmailVerificationService(jobs, resultReader, admissions, traceObserver)
    })

    describe('uploadFile', () => {
        it('enqueues a job scoped to the caller organization and credential', async () => {
            jobs.enqueue.mockResolvedValueOnce({ id: 'job-1' })

            const result = await service.uploadFile({
                bucket: 'bucket',
                key: 'key',
                organizationId,
                credentialId: 'cred-1',
            })

            expect(result).toEqual({ id: 'job-1' })
            expect(jobs.enqueue).toHaveBeenCalledWith(
                {
                    step: BatchJobStep.Validate,
                    bucket: 'bucket',
                    key: 'key',
                    organizationId,
                    credentialId: 'cred-1',
                },
                expect.any(String),
            )
        })

        it('links the batch request to the exact returned job using only safe trace fields', async () => {
            jobs.enqueue.mockResolvedValue({ id: 'returned-batch-id' })

            await service.uploadFile(
                { bucket: 'bucket', key: 'key', organizationId, credentialId: 'cred-1' },
                'server-request-id',
            )

            expect(traceObserver.enqueued).toHaveBeenCalledWith({
                requestId: 'server-request-id',
                mode: 'batch',
                jobId: 'returned-batch-id',
            })
        })

        it('preserves successful batch submission when its observer throws', async () => {
            jobs.enqueue.mockResolvedValue({ id: 'batch-1' })
            traceObserver.enqueued.mockImplementation(() => {
                throw new Error('observer unavailable')
            })

            await expect(
                service.uploadFile(
                    { bucket: 'bucket', key: 'key', organizationId, credentialId: 'cred-1' },
                    'request-id',
                ),
            ).resolves.toEqual({ id: 'batch-1' })
            expect(jobs.enqueue).toHaveBeenCalledTimes(1)
            expect(traceObserver.failed).not.toHaveBeenCalled()
        })

        it('traces dispatch failures without exposing the upload location or replacing the original error', async () => {
            const error = new Error('private-file-location')
            jobs.enqueue.mockRejectedValue(error)
            traceObserver.failed.mockImplementation(() => {
                throw new Error('observer unavailable')
            })

            await expect(
                service.uploadFile(
                    { bucket: 'bucket', key: 'key', organizationId, credentialId: 'cred-1' },
                    'request-id',
                ),
            ).rejects.toBe(error)

            expect(traceObserver.failed).toHaveBeenCalledWith({
                operationId: 'request-id',
                mode: 'batch',
                jobId: expect.any(String),
                batchId: expect.any(String),
                stage: 'queue_dispatch',
                errorType: 'Error',
                durationMs: expect.any(Number),
            })
            expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('private-file-location')
            expect(traceObserver.enqueued).not.toHaveBeenCalled()
        })
    })

    describe('getBatchStatus', () => {
        it('throws BatchEmailVerificationJobNotFoundException when the job does not exist', async () => {
            jobs.find.mockResolvedValueOnce(undefined)

            await expect(service.getBatchStatus(randomUUID(), organizationId)).rejects.toThrow(
                BatchEmailVerificationJobNotFoundException,
            )
        })

        it('throws BatchEmailVerificationJobNotFoundException when the job belongs to another organization', async () => {
            jobs.find.mockResolvedValueOnce(
                handle({
                    data: { organizationId, step: BatchJobStep.Validate, bucket: 'b', key: 'k', credentialId: 'c' },
                }),
            )

            await expect(service.getBatchStatus(randomUUID(), otherOrganizationId)).rejects.toThrow(
                BatchEmailVerificationJobNotFoundException,
            )
        })

        it('returns status for a job owned by the caller organization', async () => {
            const id = randomUUID()

            jobs.find.mockResolvedValueOnce(
                handle({
                    data: { organizationId, step: BatchJobStep.Validate, bucket: 'b', key: 'k', credentialId: 'c' },
                }),
            )

            const status = await service.getBatchStatus(id, organizationId)

            expect(status).toEqual(expect.objectContaining({ id, total: 0, processed: 0, unprocessed: 0 }))
        })

        it('uses authoritative completion for progress even if older step data lags behind', async () => {
            jobs.find.mockResolvedValue(
                handle({
                    data: {
                        organizationId,
                        step: BatchJobStep.AwaitSettlement,
                        bucket: 'b',
                        key: 'k',
                        credentialId: 'c',
                    },
                    readStatus: jest
                        .fn()
                        .mockResolvedValue({ state: 'completed', resultLocation: 's3://b/results/file.csv' }),
                    counts: jest.fn().mockResolvedValue({ processed: 8, unprocessed: 2 }),
                }),
            )
            await expect(service.getBatchStatus(randomUUID(), organizationId)).resolves.toMatchObject({
                status: 'completed',
                progress: 100,
            })
        })

        it.each([
            ['before children exist, Validate', BatchJobStep.Validate, 0, 0, 0],
            ['before children exist, Dispatch', BatchJobStep.Dispatch, 0, 0, 0],
            ['no children processed yet', BatchJobStep.AwaitSettlement, 0, 10, 0],
            ['some children processed', BatchJobStep.AwaitSettlement, 8, 2, 80],
            ['all children processed, not Infinity', BatchJobStep.AwaitSettlement, 10, 0, 100],
            ['empty batch at upload stage', BatchJobStep.UploadResults, 0, 0, 100],
            ['finish with no children', BatchJobStep.Finish, 0, 0, 100],
            ['finish always reports 100 regardless of counts', BatchJobStep.Finish, 5, 5, 100],
            ['nonfinite counts remain finite', BatchJobStep.AwaitSettlement, Number.POSITIVE_INFINITY, Number.NaN, 100],
            [
                'defensive: inconsistent negative counts never escape as NaN/Infinity',
                BatchJobStep.AwaitSettlement,
                -1,
                -1,
                100,
            ],
        ])('reports bounded progress: %s', async (_description, step, processed, unprocessed, expectedProgress) => {
            const id = randomUUID()
            const data =
                step === BatchJobStep.Finish
                    ? { organizationId, step, resultFilePath: 's3://bucket/result.csv', credentialId: 'c' }
                    : { organizationId, step, bucket: 'b', key: 'k', credentialId: 'c' }

            jobs.find.mockResolvedValueOnce(
                handle({
                    data: data as BatchJobHandle['data'],
                    counts: jest.fn().mockResolvedValue({ processed, unprocessed }),
                }),
            )

            const status = await service.getBatchStatus(id, organizationId)

            expect(status.progress).toBe(expectedProgress)
            expect(Number.isFinite(status.progress)).toBe(true)
            expect(status.progress).toBeGreaterThanOrEqual(0)
            expect(status.progress).toBeLessThanOrEqual(100)
        })
    })

    describe('getBatchResults', () => {
        it('throws BatchEmailVerificationJobNotFoundException when the job does not exist', async () => {
            jobs.find.mockResolvedValueOnce(undefined)

            await expect(service.getBatchResults(randomUUID(), organizationId)).rejects.toThrow(
                BatchEmailVerificationJobNotFoundException,
            )
        })

        it('throws BatchEmailVerificationJobNotFoundException when the job belongs to another organization', async () => {
            jobs.find.mockResolvedValueOnce(
                handle({
                    data: { organizationId, step: BatchJobStep.Finish, resultFilePath: 's3://b/k', credentialId: 'c' },
                    readStatus: jest.fn().mockResolvedValue({ state: 'completed' }),
                }),
            )

            await expect(service.getBatchResults(randomUUID(), otherOrganizationId)).rejects.toThrow(
                BatchEmailVerificationJobNotFoundException,
            )
        })

        it('throws when the job is owned by the caller but not completed', async () => {
            jobs.find.mockResolvedValueOnce(
                handle({
                    data: { organizationId, step: BatchJobStep.Dispatch, bucket: 'b', key: 'k', credentialId: 'c' },
                    readStatus: jest.fn().mockResolvedValue({ state: 'running' }),
                }),
            )

            await expect(service.getBatchResults(randomUUID(), organizationId)).rejects.toThrow()
        })

        it('streams results for a completed job owned by the caller organization', async () => {
            const readable = new Readable({ read: () => undefined })
            resultReader.read.mockResolvedValueOnce(readable)

            jobs.find.mockResolvedValueOnce(
                handle({
                    data: {
                        organizationId,
                        step: BatchJobStep.Finish,
                        resultFilePath: 's3://bucket/organizations/org-1/results/result.csv',
                        credentialId: 'c',
                    },
                    readStatus: jest.fn().mockResolvedValue({
                        state: 'completed',
                        resultLocation: 's3://bucket/organizations/org-1/results/result.csv',
                    }),
                }),
            )

            const result = await service.getBatchResults(randomUUID(), organizationId)

            expect(result).toBe(readable)
            expect(resultReader.read).toHaveBeenCalledWith('s3://bucket/organizations/org-1/results/result.csv')
        })

        it('rejects and never reads a result when the job completed without a stored result location', async () => {
            jobs.find.mockResolvedValueOnce(
                handle({
                    data: { organizationId, step: BatchJobStep.Finish, resultFilePath: 's3://b/k', credentialId: 'c' },
                    readStatus: jest.fn().mockResolvedValue({ state: 'completed' }),
                }),
            )

            await expect(service.getBatchResults(randomUUID(), organizationId)).rejects.toThrow()
            expect(resultReader.read).not.toHaveBeenCalled()
        })
    })
})
