import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { VerificationReconciliationScheduler } from '../../../application/delivery/reconciliation/verification-reconciliation-scheduler'
import {
    VERIFICATION_RECONCILIATION_JOB_NAME,
    VERIFICATION_RECONCILIATION_QUEUE_NAME,
    VERIFICATION_RECONCILIATION_SCHEDULER_ID,
} from './verification-reconciliation-queue.config'

@Injectable()
export class BullVerificationReconciliationScheduler implements VerificationReconciliationScheduler {
    constructor(
        @InjectQueue(VERIFICATION_RECONCILIATION_QUEUE_NAME)
        private readonly queue: Queue,
    ) {}

    async ensureScheduled(intervalMs: number): Promise<void> {
        await this.queue.upsertJobScheduler(
            VERIFICATION_RECONCILIATION_SCHEDULER_ID,
            { every: intervalMs },
            { name: VERIFICATION_RECONCILIATION_JOB_NAME },
        )
    }
}
