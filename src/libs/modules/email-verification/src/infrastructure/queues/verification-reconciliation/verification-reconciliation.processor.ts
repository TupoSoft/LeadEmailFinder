import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { VerificationReconcileReport, VerificationReconciler } from '../../../application/operations/verification-reconciler'
import { VERIFICATION_RECONCILER_PAGE_LIMIT } from '../../../application/operations/verification-execution-timing'
import { VERIFICATION_RECONCILIATION_QUEUE_NAME } from './verification-reconciliation-queue.config'

@Processor(VERIFICATION_RECONCILIATION_QUEUE_NAME)
export class VerificationReconciliationProcessor extends WorkerHost {
    constructor(private readonly reconciler: VerificationReconciler) {
        super()
    }

    async process(_job: Job): Promise<VerificationReconcileReport> {
        return this.reconciler.reconcile(VERIFICATION_RECONCILER_PAGE_LIMIT)
    }
}
