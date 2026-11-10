import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { BatchAdmissionModule } from '../../batch-admission.module'
import { VERIFICATION_CLOCK, VerificationClock } from '../../../application/ports/verification-clock'
import {
    VERIFICATION_REQUEST_STORE,
    VerificationRequestStore,
} from '../../../application/ports/verification-request-store'
import {
    VERIFICATION_EXECUTION_STORE,
    VerificationExecutionStore,
} from '../../../application/ports/verification-execution-store'
import {
    VERIFICATION_SETTLEMENT_STORE,
    VerificationSettlementStore,
} from '../../../application/ports/verification-settlement-store'
import { BATCH_ADMISSION_RECOVERY, BatchAdmissionRecovery } from '../../../application/ports/batch-admission-recovery'
import { VerificationSettlementService } from '../../../application/operations/verification-settlement.service'
import {
    VERIFICATION_EXECUTION_DISPATCHER,
    VerificationExecutionDispatcher,
} from '../../../application/ports/verification-execution-dispatcher'
import { VerificationExecutionModule } from '../verification-execution/verification-execution.module'
import { VerificationReconciler } from '../../../application/operations/verification-reconciler'
import {
    VERIFICATION_RECONCILIATION_SCHEDULER,
    VerificationReconciliationScheduler,
} from '../../../application/delivery/reconciliation/verification-reconciliation-scheduler'
import { VERIFICATION_RECONCILER_INTERVAL_MS } from '../../../application/operations/verification-execution-timing'
import { BullVerificationReconciliationScheduler } from './bull-verification-reconciliation-scheduler'
import { VerificationReconciliationProcessor } from './verification-reconciliation.processor'
import { VERIFICATION_RECONCILIATION_QUEUE_NAME } from './verification-reconciliation-queue.config'

@Module({
    imports: [
        EmailVerificationCoreModule,
        BatchAdmissionModule,
        VerificationExecutionModule,
        CreditsModule,
        BullModule.registerQueue({ name: VERIFICATION_RECONCILIATION_QUEUE_NAME }),
    ],
    providers: [
        {
            provide: VerificationReconciler,
            inject: [
                VERIFICATION_EXECUTION_STORE,
                VERIFICATION_REQUEST_STORE,
                VERIFICATION_SETTLEMENT_STORE,
                VerificationSettlementService,
                VERIFICATION_EXECUTION_DISPATCHER,
                CreditReservationService,
                VERIFICATION_CLOCK,
                BATCH_ADMISSION_RECOVERY,
            ],
            useFactory: (
                executions: VerificationExecutionStore,
                requests: VerificationRequestStore,
                settlements: VerificationSettlementStore,
                settlementService: VerificationSettlementService,
                dispatcher: VerificationExecutionDispatcher,
                credits: CreditReservationService,
                clock: VerificationClock,
                batchAdmissionRecovery: BatchAdmissionRecovery,
            ) =>
                new VerificationReconciler(
                    executions,
                    requests,
                    settlements,
                    settlementService,
                    dispatcher,
                    credits,
                    clock,
                    batchAdmissionRecovery,
                ),
        },
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
