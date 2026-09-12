import { Module } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from './infrastructure/email-verification-core.module'
import { AsyncEmailVerificationModule } from './infrastructure/queues/async-verification/async-email-verification.module'
import { AsyncEmailVerificationController } from './api/http/asynchronous-verification/async-email-verification.controller'
import { BatchEmailVerificationModule } from './infrastructure/queues/batch-verification/batch-email-verification.module'
import { BatchEmailVerificationController } from './api/http/batch-verification/batch-email-verification.controller'
import { SyncEmailVerificationController } from './api/http/synchronous-verification/current/sync-email-verification.controller'
import { EmailAdministrationController } from './api/http/email-administration/email-administration.controller'
import { EmailVerificationOrchestrator } from './application/email-verification.service'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
    SynchronousVerificationCore,
} from './application/delivery/synchronous/run-synchronous-verification'
import { VerificationResultsController } from './api/verification-results.controller'
import { VERIFICATION_RESULT_READER, VerificationResultReader } from './application/verification-result-reader'
import { TypeOrmVerificationResultReader } from './infrastructure/typeorm-verification-result-reader'
import { EmailVerificationEntity } from './infrastructure/persistence/typeorm/email-verification.entity'
import { VERIFICATION_CLOCK, VerificationClock } from './application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from './application/ports/verification-request-store'
import { VERIFICATION_EXECUTION_STORE, VerificationExecutionStore } from './application/ports/verification-execution-store'
import { VerificationOperationsReader } from './application/operations/verification-operations-reader'
import { VerificationReconciliationModule } from './infrastructure/queues/verification-reconciliation/verification-reconciliation.module'

@Module({
    imports: [
        EmailVerificationCoreModule,
        AsyncEmailVerificationModule,
        BatchEmailVerificationModule,
        CreditsModule,
        VerificationReconciliationModule,
    ],
    controllers: [
        AsyncEmailVerificationController,
        BatchEmailVerificationController,
        SyncEmailVerificationController,
        EmailAdministrationController,
        VerificationResultsController,
    ],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: RUN_SYNCHRONOUS_VERIFICATION,
            inject: [EmailVerificationOrchestrator],
            useFactory: (core: SynchronousVerificationCore) => new RunSynchronousVerification(core),
        },
        {
            provide: VERIFICATION_RESULT_READER,
            inject: [getRepositoryToken(EmailVerificationEntity)],
            useFactory: (repository: Repository<EmailVerificationEntity>) =>
                new TypeOrmVerificationResultReader(repository),
        },
        {
            provide: VerificationOperationsReader,
            inject: [VERIFICATION_REQUEST_STORE, VERIFICATION_EXECUTION_STORE, VERIFICATION_RESULT_READER, VERIFICATION_CLOCK],
            useFactory: (
                requests: VerificationRequestStore,
                executions: VerificationExecutionStore,
                results: VerificationResultReader,
                clock: VerificationClock,
            ) => new VerificationOperationsReader(requests, executions, results, clock),
        },
    ],
    exports: [VerificationOperationsReader],
})
export class EmailVerificationModule {}
