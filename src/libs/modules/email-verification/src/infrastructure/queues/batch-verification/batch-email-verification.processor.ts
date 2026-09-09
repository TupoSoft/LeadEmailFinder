import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job, WaitingChildrenError } from 'bullmq'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAwaitingChildrenSignal } from '../../../application/delivery/batch/batch-awaiting-children.signal'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { BatchQueueJobData, batchJobHandleFromJob } from './bull-batch-jobs'
import { classifyBatchTerminalFailure } from '../../../application/delivery/batch/batch-terminal-failure'

@Processor(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
export class BatchEmailVerificationProcessor extends WorkerHost {
    constructor(private readonly workflow: BatchEmailVerificationWorkflow) {
        super()
    }

    async process(job: Job<BatchQueueJobData, string>, token: string): Promise<string> {
        try {
            return await this.workflow.advance(batchJobHandleFromJob(job), token)
        } catch (error) {
            if (error instanceof WaitingChildrenError) throw error
            if (error instanceof BatchAwaitingChildrenSignal) {
                throw new WaitingChildrenError()
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
