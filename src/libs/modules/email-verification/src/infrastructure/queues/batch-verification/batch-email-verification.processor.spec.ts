import { WaitingChildrenError } from 'bullmq'
import { BatchJobStep } from '../../../domain/batch-job'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAwaitingChildrenSignal } from '../../../application/delivery/batch/batch-awaiting-children.signal'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'

describe('BatchEmailVerificationProcessor', () => {
    let workflow: jest.Mocked<Pick<BatchEmailVerificationWorkflow, 'advance'>>
    let processor: BatchEmailVerificationProcessor

    beforeEach(() => {
        workflow = { advance: jest.fn() }
        processor = new BatchEmailVerificationProcessor(workflow as unknown as BatchEmailVerificationWorkflow)
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

    it('translates the awaiting-children signal into a real BullMQ WaitingChildrenError', async () => {
        workflow.advance.mockRejectedValue(new BatchAwaitingChildrenSignal())

        const job = {
            id: 'job-1',
            data: { step: BatchJobStep.WaitForChildren, bucket: 'b', key: 'k', organizationId: 'org-1', credentialId: 'c' },
        }

        await expect(processor.process(job as never, 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
    })

    it('propagates any other workflow failure unchanged', async () => {
        const error = new Error('sentinel@private.example upload diagnostics')
        workflow.advance.mockRejectedValue(error)

        const job = {
            id: 'job-1',
            data: { step: BatchJobStep.UploadResults, bucket: 'b', key: 'k', organizationId: 'org-1', credentialId: 'c' },
        }

        await expect(processor.process(job as never, 'token')).rejects.toBe(error)
    })
})
