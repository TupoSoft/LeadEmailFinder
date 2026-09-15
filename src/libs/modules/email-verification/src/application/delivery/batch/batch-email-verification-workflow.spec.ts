import { VerificationTraceObserver } from '../../verification-trace/verification-trace-observer'
import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { VerificationExecutionDispatcher } from '../../ports/verification-execution-dispatcher'
import { BatchJobHandle } from './batch-jobs'
import { BatchInput } from './batch-input'
import { BatchAdmissionStore, BatchUniqueAddressRecord } from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'
import { BatchRowStore } from './batch-row-store'
import { BatchResultWriter } from './batch-result-writer'
import { BatchAwaitingSettlementSignal } from './batch-awaiting-settlement.signal'
import { BatchEmailVerificationWorkflow } from './batch-email-verification-workflow'

function fakeHandle(initial: BatchJobData): BatchJobHandle & { data: BatchJobData } {
    const handle = {
        id: 'job-1',
        queueQualifiedName: 'bull:batch-email-verification',
        attemptsMade: 0,
        data: initial,
        readStatus: jest.fn().mockResolvedValue({ state: 'running' }),
        counts: jest.fn().mockResolvedValue({ processed: 2, unprocessed: 0 }),
        updateStep: jest.fn((next: BatchJobData) => {
            handle.data = next
            return Promise.resolve()
        }),
    }
    return handle
}

async function* rowsOf(emails: string[]): AsyncIterable<{ email: string }> {
    await Promise.resolve()
    for (const email of emails) yield { email }
}

function throwingRows(error: Error): AsyncIterable<{ email: string }> {
    return {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    }
}

function address(overrides: Partial<BatchUniqueAddressRecord> = {}): BatchUniqueAddressRecord {
    return {
        batchId: 'job-1',
        normalizedAddress: 'a@example.test',
        firstSeenRow: 1,
        admissionKind: 'created',
        executionId: 'execution-1',
        resultId: null,
        payerRequestId: 'request-1',
        ...overrides,
    }
}

describe('BatchEmailVerificationWorkflow', () => {
    let input: jest.Mocked<BatchInput>
    let rows: jest.Mocked<BatchRowStore>
    let admissions: jest.Mocked<BatchAdmissionStore>
    let admissionService: jest.Mocked<Pick<BatchAdmissionService, 'admit'>>
    let dispatcher: jest.Mocked<VerificationExecutionDispatcher>
    let resultWriter: jest.Mocked<BatchResultWriter>
    let traceObserver: jest.Mocked<VerificationTraceObserver>
    let workflow: BatchEmailVerificationWorkflow

    beforeEach(() => {
        input = { rows: jest.fn() }
        rows = { insertMany: jest.fn(), pageBySourceRow: jest.fn(), countRows: jest.fn() }
        admissions = {
            createOrReplay: jest.fn(),
            findById: jest.fn(),
            findByClientKey: jest.fn(),
            updateState: jest.fn(),
            insertUniqueAddresses: jest.fn(),
            pageUniqueAddresses: jest.fn().mockResolvedValue([]),
            recordAdmissionOutcome: jest.fn(),
            recordPayerRequestId: jest.fn(),
            countUnsettledAddresses: jest.fn().mockResolvedValue(0),
            getStatusCounts: jest.fn(),
        }
        admissionService = { admit: jest.fn().mockResolvedValue(undefined) }
        dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) }
        resultWriter = { write: jest.fn() }
        traceObserver = {
            enqueued: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            batchCompleted: jest.fn(),
        }
        workflow = new BatchEmailVerificationWorkflow(
            input,
            rows,
            admissions,
            admissionService as unknown as BatchAdmissionService,
            dispatcher,
            resultWriter,
            traceObserver,
            1_000,
        )
    })

    describe('Validate', () => {
        it('persists ordered rows and unique addresses, then creates the admission manifest', async () => {
            input.rows.mockReturnValueOnce(rowsOf(['A@Example.test', 'b@example.test', 'a@example.test']))
            resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

            const job = fakeHandle({ step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

            await workflow.advance(job, 'token')

            expect(rows.insertMany).toHaveBeenCalledWith('org-1', [
                { batchId: 'job-1', sourceRow: 1, originalEmail: 'A@Example.test', normalizedAddress: 'a@example.test' },
                { batchId: 'job-1', sourceRow: 2, originalEmail: 'b@example.test', normalizedAddress: 'b@example.test' },
                { batchId: 'job-1', sourceRow: 3, originalEmail: 'a@example.test', normalizedAddress: 'a@example.test' },
            ])
            expect(admissions.insertUniqueAddresses).toHaveBeenCalledWith('job-1', 'org-1', [
                { normalizedAddress: 'a@example.test', firstSeenRow: 1 },
                { normalizedAddress: 'b@example.test', firstSeenRow: 2 },
            ])
            expect(admissions.createOrReplay).toHaveBeenCalledWith({
                batchId: 'job-1',
                organizationId: 'org-1',
                totalRows: 3,
                uniqueAddressCount: 2,
                clientRequestKey: null,
                contentDigest: null,
            })
        })

        it('classifies an invalid row failure at the validation stage without exposing the address', async () => {
            input.rows.mockReturnValueOnce(throwingRows(new Error('batch_email_verification_row_invalid')))

            const job = fakeHandle({ step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

            await expect(workflow.advance(job, 'token')).rejects.toThrow('batch_email_verification_row_invalid')

            expect(traceObserver.failed).toHaveBeenCalledWith(
                expect.objectContaining({ operationId: 'job-1', mode: 'batch', jobId: 'job-1', batchId: 'job-1', stage: 'batch_validation' }),
            )
            expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('batch_email_verification_row_invalid')
        })
    })

    it('advances Admit to Dispatch by calling the admission service', async () => {
        dispatcher.dispatch.mockResolvedValue(undefined)
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })
        const job = fakeHandle({ step: BatchJobStep.Admit, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await workflow.advance(job, 'token')

        expect(admissionService.admit).toHaveBeenCalledWith('job-1', 'org-1')
    })

    it('dispatches only newly created executions during Dispatch', async () => {
        admissions.pageUniqueAddresses.mockResolvedValueOnce([
            address({ normalizedAddress: 'created@example.test', admissionKind: 'created', executionId: 'execution-1' }),
            address({ normalizedAddress: 'cached@example.test', admissionKind: 'cache', executionId: null }),
            address({ normalizedAddress: 'shared@example.test', admissionKind: 'shared', executionId: 'execution-2' }),
        ])
        admissions.pageUniqueAddresses.mockResolvedValueOnce([])
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.Dispatch, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await workflow.advance(job, 'token')

        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
        expect(dispatcher.dispatch).toHaveBeenCalledWith('execution-1', 'org-1')
    })

    describe('AwaitSettlement', () => {
        it('raises the awaiting-settlement signal instead of advancing when addresses remain unsettled', async () => {
            admissions.countUnsettledAddresses.mockResolvedValue(2)

            const job = fakeHandle({ step: BatchJobStep.AwaitSettlement, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

            await expect(workflow.advance(job, 'token')).rejects.toBeInstanceOf(BatchAwaitingSettlementSignal)
            expect(job.data.step).toBe(BatchJobStep.AwaitSettlement)
        })

        it('does not trace a failure when the awaiting-settlement signal is raised', async () => {
            admissions.countUnsettledAddresses.mockResolvedValue(1)

            const job = fakeHandle({ step: BatchJobStep.AwaitSettlement, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

            await expect(workflow.advance(job, 'token')).rejects.toBeInstanceOf(BatchAwaitingSettlementSignal)
            expect(traceObserver.failed).not.toHaveBeenCalled()
        })

        it('advances to UploadResults once every address has settled', async () => {
            admissions.countUnsettledAddresses.mockResolvedValue(0)
            resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

            const job = fakeHandle({ step: BatchJobStep.AwaitSettlement, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

            const result = await workflow.advance(job, 'token')

            expect(result).toBe('s3://bucket/results/file.csv')
            expect(job.data).toEqual({
                step: BatchJobStep.Finish,
                resultFilePath: 's3://bucket/results/file.csv',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            })
        })
    })

    it('writes results and reaches Finish with the exact stored location', async () => {
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/organizations/org-1/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.UploadResults, bucket: 'bucket', key: 'organizations/org-1/uploads/file.csv', organizationId: 'org-1', credentialId: 'cred-1' })

        const result = await workflow.advance(job, 'token')

        expect(resultWriter.write).toHaveBeenCalledWith('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')
        expect(result).toBe('s3://bucket/organizations/org-1/results/file.csv')
    })

    it('reports bounded batch completion counts once Finish is reached', async () => {
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.UploadResults, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await workflow.advance(job, 'token')

        expect(traceObserver.batchCompleted).toHaveBeenCalledWith({
            batchId: 'job-1',
            total: 2,
            processed: 2,
            unprocessed: 0,
            durationMs: expect.any(Number),
        })
    })

    it.each(['observer', 'counts'])('keeps the uploaded result when completion %s fails', async failure => {
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })
        const job = fakeHandle({ step: BatchJobStep.UploadResults, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        if (failure === 'observer') {
            traceObserver.batchCompleted.mockImplementation(() => {
                throw new Error('observer unavailable')
            })
        } else {
            job.counts = jest.fn().mockRejectedValue(new Error('queue unavailable'))
        }

        await expect(workflow.advance(job, 'token')).resolves.toBe('s3://bucket/results/file.csv')
        expect(job.data.step).toBe(BatchJobStep.Finish)
        expect(traceObserver.failed).not.toHaveBeenCalled()
    })

    it('preserves failed publication and reports the same job on retry even when the observer fails', async () => {
        const error = new Error('sentinel@private.example upload diagnostics')
        resultWriter.write.mockRejectedValue(error)
        traceObserver.failed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })
        const job = fakeHandle({ step: BatchJobStep.UploadResults, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toBe(error)
        ;(job as { attemptsMade: number }).attemptsMade = 1
        await expect(workflow.advance(job, 'token')).rejects.toBe(error)

        expect(traceObserver.failed.mock.calls.map(([event]) => event)).toEqual([
            {
                operationId: 'job-1',
                mode: 'batch',
                jobId: 'job-1',
                batchId: 'job-1',
                attempt: 1,
                stage: 'batch_result_publication',
                errorType: 'Error',
                durationMs: expect.any(Number),
            },
            {
                operationId: 'job-1',
                mode: 'batch',
                jobId: 'job-1',
                batchId: 'job-1',
                attempt: 2,
                stage: 'batch_result_publication',
                errorType: 'Error',
                durationMs: expect.any(Number),
            },
        ])
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('sentinel')
        expect(traceObserver.batchCompleted).not.toHaveBeenCalled()
        expect(job.data.step).toBe(BatchJobStep.UploadResults)
    })

    it('classifies a dispatch failure as a queue_dispatch failure while preserving the original error', async () => {
        admissions.pageUniqueAddresses.mockResolvedValueOnce([address({ admissionKind: 'created', executionId: 'execution-1' })])
        const error = new Error('redis unavailable')
        dispatcher.dispatch.mockRejectedValue(error)

        const job = fakeHandle({ step: BatchJobStep.Dispatch, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toBe(error)
        expect(traceObserver.failed).toHaveBeenCalledWith(expect.objectContaining({ stage: 'queue_dispatch' }))
    })
})
