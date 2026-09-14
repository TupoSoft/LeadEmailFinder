import { DelayedError, Job } from 'bullmq'
import { VerificationExecutionRunner } from '../../../application/operations/verification-execution-runner'
import { VerificationExecutionPermitUnavailableException } from './verification-execution-permit-unavailable.exception'
import { VerificationExecutionProcessor } from './verification-execution.processor'
import { VerificationExecutionJobData } from './verification-execution-queue.config'

const now = new Date('2026-09-13T00:00:00.000Z')

function job(data: VerificationExecutionJobData, moveToDelayed = jest.fn()): Job<VerificationExecutionJobData> {
    return { data, moveToDelayed } as unknown as Job<VerificationExecutionJobData>
}

describe('VerificationExecutionProcessor', () => {
    let runner: jest.Mocked<Pick<VerificationExecutionRunner, 'execute'>>
    let processor: VerificationExecutionProcessor

    beforeEach(() => {
        runner = { execute: jest.fn() }
        processor = new VerificationExecutionProcessor(runner as unknown as VerificationExecutionRunner)
    })

    const data: VerificationExecutionJobData = { v: 1, executionId: 'execution-1', organizationId: 'org-1' }

    it('runs the execution once and does nothing more on settlement', async () => {
        runner.execute.mockResolvedValue({ kind: 'settled' })
        await processor.process(job(data))
        expect(runner.execute).toHaveBeenCalledWith('execution-1', 'org-1')
    })

    it('throws a permit-unavailable exception so BullMQ retries after a short fixed delay', async () => {
        runner.execute.mockResolvedValue({ kind: 'permit-unavailable' })
        await expect(processor.process(job(data))).rejects.toBeInstanceOf(VerificationExecutionPermitUnavailableException)
    })

    it('moves the same job to delayed for a scheduled retry, instead of adding a duplicate job ID', async () => {
        const moveToDelayed = jest.fn().mockResolvedValue(undefined)
        const retryAt = new Date(now.getTime() + 5_000)
        runner.execute.mockResolvedValue({ kind: 'retry-scheduled', retryAt })

        await expect(processor.process(job(data, moveToDelayed), 'lock-token')).rejects.toBeInstanceOf(DelayedError)

        expect(moveToDelayed).toHaveBeenCalledWith(retryAt.getTime(), 'lock-token')
    })

    it.each(['lease-lost', 'not-runnable'] as const)('does nothing more on %s', async kind => {
        runner.execute.mockResolvedValue({ kind })
        await expect(processor.process(job(data))).resolves.toBeUndefined()
    })
})
