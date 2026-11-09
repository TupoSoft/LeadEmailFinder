import { DelayedError } from 'bullmq'
import { BatchJobStep } from '../../../domain/batch-job'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAwaitingSettlementSignal } from '../../../application/delivery/batch/batch-awaiting-settlement.signal'
import { BatchAdmissionStore } from '../../../application/delivery/batch/batch-admission-store'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { InvalidBatchCsvError } from '../../../application/delivery/batch/batch-terminal-failure'
import { InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'

describe('BatchEmailVerificationProcessor', () => {
    let workflow: jest.Mocked<Pick<BatchEmailVerificationWorkflow, 'advance'>>
    let admissions: jest.Mocked<Pick<BatchAdmissionStore, 'findById' | 'countUnsettledAddresses'>>
    let processor: BatchEmailVerificationProcessor

    beforeEach(() => {
        workflow = { advance: jest.fn() }
        admissions = { findById: jest.fn(), countUnsettledAddresses: jest.fn() }
        processor = new BatchEmailVerificationProcessor(
            workflow as unknown as BatchEmailVerificationWorkflow,
            admissions as unknown as BatchAdmissionStore,
        )
    })

    it('delegates to the workflow and returns its result', async () => {
        workflow.advance.mockResolvedValue('s3://bucket/organizations/org-1/results/file.csv')

        const job = {
            id: 'job-1',
            data: {
                step: BatchJobStep.UploadResults,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
        }

        const result = await processor.process(job as never, 'token')

        expect(result).toBe('s3://bucket/organizations/org-1/results/file.csv')
        expect(workflow.advance).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }), 'token')
    })

    it('translates the awaiting-settlement signal into a real BullMQ moveToDelayed + DelayedError', async () => {
        const retryAtMs = Date.now() + 5_000
        workflow.advance.mockRejectedValue(new BatchAwaitingSettlementSignal(retryAtMs))

        const job = {
            id: 'job-1',
            data: {
                step: BatchJobStep.AwaitSettlement,
                bucket: 'b',
                key: 'k',
                organizationId: 'org-1',
                credentialId: 'c',
            },
            moveToDelayed: jest.fn().mockResolvedValue(undefined),
            updateData: jest.fn(),
        }

        await expect(processor.process(job as never, 'token')).rejects.toBeInstanceOf(DelayedError)
        expect(job.moveToDelayed).toHaveBeenCalledWith(retryAtMs, 'token')
        expect(job.updateData).not.toHaveBeenCalled()
    })

    it.each([
        [new InvalidBatchCsvError(), 'invalid_csv'],
        [new InsufficientCreditsException('private-organization'), 'insufficient_credits'],
        [new Error('sentinel@private.example upload diagnostics'), 'processing_failed'],
    ])(
        'records only the safe failure classification %# and propagates the original error',
        async (error, failureCode) => {
            workflow.advance.mockRejectedValue(error)

            const job = {
                id: 'job-1',
                data: {
                    step: BatchJobStep.UploadResults,
                    bucket: 'b',
                    key: 'k',
                    organizationId: 'org-1',
                    credentialId: 'c',
                },
                updateData: jest.fn().mockResolvedValue(undefined),
            }

            await expect(processor.process(job as never, 'token')).rejects.toBe(error)
            expect(job.updateData).toHaveBeenCalledWith({ ...job.data, failureCode })
            expect(JSON.stringify(job.updateData.mock.calls)).not.toMatch(/sentinel|diagnostics|private-organization/)
        },
    )

    it('does not replace the original error when recording its marker fails', async () => {
        const error = new InvalidBatchCsvError()
        workflow.advance.mockRejectedValue(error)
        const job = { data: {}, updateData: jest.fn().mockRejectedValue(new Error('queue unavailable')) }

        await expect(processor.process(job as never, 'token')).rejects.toBe(error)
    })

    it('returns a successful retry unchanged even when an earlier marker remains in stored data', async () => {
        workflow.advance.mockResolvedValue('s3://bucket/results/file.csv')
        const job = { data: { failureCode: 'processing_failed' }, updateData: jest.fn() }

        await expect(processor.process(job as never, 'token')).resolves.toBe('s3://bucket/results/file.csv')
        expect(job.updateData).not.toHaveBeenCalled()
    })
})
