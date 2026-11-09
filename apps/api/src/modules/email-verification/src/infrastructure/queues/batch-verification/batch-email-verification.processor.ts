import { Inject, Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { DelayedError, Job } from 'bullmq'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAwaitingSettlementSignal } from '../../../application/delivery/batch/batch-awaiting-settlement.signal'
import { BATCH_ADMISSION_STORE, BatchAdmissionStore } from '../../../application/delivery/batch/batch-admission-store'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { BatchQueueJobData, batchJobHandleFromJob } from './bull-batch-jobs'
import { classifyBatchTerminalFailure } from '../../../application/delivery/batch/batch-terminal-failure'

@Injectable()
@Processor(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
export class BatchEmailVerificationProcessor extends WorkerHost {
    constructor(
        private readonly workflow: BatchEmailVerificationWorkflow,
        @Inject(BATCH_ADMISSION_STORE) private readonly admissions: BatchAdmissionStore,
    ) {
        super()
    }

    /**
     * A pending-settlement signal moves the SAME job into the delayed state (`moveToDelayed` + `DelayedError`)
     * rather than adding a new job with the same ID, mirroring `VerificationExecutionProcessor`'s own retry-
     * scheduling idiom for exactly the same reason: re-adding a job with the same ID while this attempt is still
     * `active` is a silent BullMQ no-op.
     */
    async process(job: Job<BatchQueueJobData, string>, token: string): Promise<string> {
        try {
            return await this.workflow.advance(batchJobHandleFromJob(job, this.admissions), token)
        } catch (error) {
            if (error instanceof BatchAwaitingSettlementSignal) {
                await job.moveToDelayed(error.retryAtMs, token)
                throw new DelayedError()
            }
            try {
                await job.updateData({ ...job.data, failureCode: classifyBatchTerminalFailure(error) })
            } catch {
                // Marker persistence must not replace the original failure. Missing markers use the safe fallback.
            }
            throw error
        }
    }
}
