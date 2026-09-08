import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationTraceObserver } from '../../verification-trace/verification-trace-observer'
import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { BatchJobHandle } from './batch-jobs'
import { BatchInput } from './batch-input'
import { BatchChildFlow } from './batch-child-flow'
import { BatchResultWriter } from './batch-result-writer'
import { BatchAwaitingChildrenSignal } from './batch-awaiting-children.signal'
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

describe('BatchEmailVerificationWorkflow', () => {
    let input: jest.Mocked<BatchInput>
    let childFlow: jest.Mocked<BatchChildFlow>
    let resultWriter: jest.Mocked<BatchResultWriter>
    let creditsService: jest.Mocked<CreditsService>
    let traceObserver: jest.Mocked<VerificationTraceObserver>
    let workflow: BatchEmailVerificationWorkflow

    beforeEach(() => {
        input = { rows: jest.fn() }
        childFlow = { dispatchChild: jest.fn(), awaitChildren: jest.fn() }
        resultWriter = { write: jest.fn() }
        creditsService = { debit: jest.fn() } as unknown as jest.Mocked<CreditsService>
        traceObserver = {
            enqueued: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            batchCompleted: jest.fn(),
        }
        workflow = new BatchEmailVerificationWorkflow(input, childFlow, resultWriter, creditsService, traceObserver)
    })

    it('advances Validate to Process, debiting one credit per counted row', async () => {
        input.rows.mockReturnValueOnce(rowsOf(['a@example.test', 'b@example.test']))
        input.rows.mockReturnValueOnce(rowsOf([]))
        childFlow.awaitChildren.mockResolvedValue({ shouldWait: false })
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await workflow.advance(job, 'token')

        expect(creditsService.debit).toHaveBeenCalledWith('org-1', 2, 'job-1')
    })

    it('dispatches exactly one child per row during Process', async () => {
        input.rows.mockReturnValueOnce(rowsOf(['a@example.test', 'b@example.test']))
        childFlow.awaitChildren.mockResolvedValue({ shouldWait: false })
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.Process, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await workflow.advance(job, 'token')

        expect(childFlow.dispatchChild).toHaveBeenCalledTimes(2)
        expect(childFlow.dispatchChild).toHaveBeenCalledWith(
            { id: 'job-1', queueQualifiedName: 'bull:batch-email-verification' },
            { email: 'a@example.test', organizationId: 'org-1', credentialId: 'cred-1' },
        )
    })

    it('raises the awaiting-children signal instead of advancing when children are still pending', async () => {
        childFlow.awaitChildren.mockResolvedValue({ shouldWait: true })

        const job = fakeHandle({ step: BatchJobStep.WaitForChildren, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toBeInstanceOf(BatchAwaitingChildrenSignal)
        expect(job.data.step).toBe(BatchJobStep.WaitForChildren)
    })

    it('advances WaitForChildren to UploadResults once children are done', async () => {
        childFlow.awaitChildren.mockResolvedValue({ shouldWait: false })
        resultWriter.write.mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' })

        const job = fakeHandle({ step: BatchJobStep.WaitForChildren, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        const result = await workflow.advance(job, 'token')

        expect(result).toBe('s3://bucket/results/file.csv')
        expect(job.data).toEqual({
            step: BatchJobStep.Finish,
            resultFilePath: 's3://bucket/results/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
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

    it('classifies an invalid row failure at the validation stage without exposing the address', async () => {
        input.rows.mockReturnValueOnce(throwingRows(new Error('batch_email_verification_row_invalid')))

        const job = fakeHandle({ step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toThrow('batch_email_verification_row_invalid')

        expect(traceObserver.failed).toHaveBeenCalledWith(
            expect.objectContaining({ operationId: 'job-1', mode: 'batch', jobId: 'job-1', batchId: 'job-1', stage: 'batch_validation' }),
        )
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('batch_email_verification_row_invalid')
    })

    it('classifies a child dispatch failure as a queue_dispatch failure while preserving the original error', async () => {
        input.rows.mockReturnValueOnce(rowsOf(['a@example.test']))
        const error = new Error('redis unavailable')
        childFlow.dispatchChild.mockRejectedValue(error)

        const job = fakeHandle({ step: BatchJobStep.Process, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toBe(error)
        expect(traceObserver.failed).toHaveBeenCalledWith(expect.objectContaining({ stage: 'queue_dispatch' }))
    })

    it('does not trace a failure when the awaiting-children signal is raised', async () => {
        childFlow.awaitChildren.mockResolvedValue({ shouldWait: true })

        const job = fakeHandle({ step: BatchJobStep.WaitForChildren, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' })

        await expect(workflow.advance(job, 'token')).rejects.toBeInstanceOf(BatchAwaitingChildrenSignal)
        expect(traceObserver.failed).not.toHaveBeenCalled()
    })
})
