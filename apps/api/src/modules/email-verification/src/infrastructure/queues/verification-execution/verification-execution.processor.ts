import { Processor, WorkerHost } from '@nestjs/bullmq'
import { DelayedError, Job } from 'bullmq'
import { VerificationExecutionRunner } from '../../../application/operations/verification-execution-runner'
import { VerificationExecutionPermitUnavailableException } from './verification-execution-permit-unavailable.exception'
import { VERIFICATION_EXECUTION_QUEUE_NAME, VerificationExecutionJobData, verificationExecutionBackoff } from './verification-execution-queue.config'

@Processor(VERIFICATION_EXECUTION_QUEUE_NAME, { settings: { backoffStrategy: verificationExecutionBackoff } })
export class VerificationExecutionProcessor extends WorkerHost {
    constructor(private readonly runner: VerificationExecutionRunner) {
        super()
    }

    /**
     * A retry-scheduled outcome moves the SAME job into the delayed state (`moveToDelayed` + `DelayedError`)
     * rather than adding a new job with the same ID — re-adding while this attempt is still `active` would be a
     * silent no-op (BullMQ dedupes `add()` by job ID against any non-terminal job), dropping the retry entirely
     * and leaving the reconciler as the only backstop. Verified empirically against real Redis.
     */
    async process(job: Job<VerificationExecutionJobData>, token?: string): Promise<void> {
        const { executionId, organizationId } = job.data
        const outcome = await this.runner.execute(executionId, organizationId)

        if (outcome.kind === 'permit-unavailable') {
            throw new VerificationExecutionPermitUnavailableException(executionId)
        }

        if (outcome.kind === 'retry-scheduled') {
            await job.moveToDelayed(outcome.retryAt.getTime(), token)
            throw new DelayedError()
        }
    }
}
