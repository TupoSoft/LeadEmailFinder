import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job, WaitingChildrenError } from 'bullmq'
import { BatchJobData } from '../../../domain/batch-job'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAwaitingChildrenSignal } from '../../../application/delivery/batch/batch-awaiting-children.signal'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { batchJobHandleFromJob } from './bull-batch-jobs'

@Processor(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
export class BatchEmailVerificationProcessor extends WorkerHost {
    constructor(private readonly workflow: BatchEmailVerificationWorkflow) {
        super()
    }

    async process(job: Job<BatchJobData, string>, token: string): Promise<string> {
        try {
            return await this.workflow.advance(batchJobHandleFromJob(job), token)
        } catch (error) {
            if (error instanceof BatchAwaitingChildrenSignal) {
                throw new WaitingChildrenError()
            }
            throw error
        }
    }
}
