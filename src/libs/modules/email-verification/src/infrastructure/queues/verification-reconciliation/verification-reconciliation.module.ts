import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import {
    VERIFICATION_RECONCILIATION_SCHEDULER,
    VerificationReconciliationScheduler,
} from '../../../application/delivery/reconciliation/verification-reconciliation-scheduler'
import { VERIFICATION_RECONCILER_INTERVAL_MS } from '../../../application/operations/verification-execution-timing'
import { BullVerificationReconciliationScheduler } from './bull-verification-reconciliation-scheduler'
import { VerificationReconciliationProcessor } from './verification-reconciliation.processor'
import { VERIFICATION_RECONCILIATION_QUEUE_NAME } from './verification-reconciliation-queue.config'

@Module({
    imports: [EmailVerificationCoreModule, BullModule.registerQueue({ name: VERIFICATION_RECONCILIATION_QUEUE_NAME })],
    providers: [
        BullVerificationReconciliationScheduler,
        VerificationReconciliationProcessor,
        { provide: VERIFICATION_RECONCILIATION_SCHEDULER, useExisting: BullVerificationReconciliationScheduler },
    ],
})
export class VerificationReconciliationModule implements OnApplicationBootstrap {
    constructor(
        @Inject(VERIFICATION_RECONCILIATION_SCHEDULER)
        private readonly scheduler: VerificationReconciliationScheduler,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.scheduler.ensureScheduled(VERIFICATION_RECONCILER_INTERVAL_MS)
    }
}
