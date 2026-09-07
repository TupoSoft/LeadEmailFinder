import { Module } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from './infrastructure/email-verification-core.module'
import { AsyncEmailVerificationModule } from './infrastructure/queues/async-verification/async-email-verification.module'
import { AsyncEmailVerificationController } from './api/http/asynchronous-verification/async-email-verification.controller'
import { BatchEmailVerificationModule } from './batch-email-verification'
import { SyncEmailVerificationController } from './api/http/synchronous-verification/current/sync-email-verification.controller'
import { OldSyncEmailVerificationController } from './api/http/synchronous-verification/deprecated/old-sync-email-verification.controller'
import { OldSyncEmailVerificationProfile } from './api/http/synchronous-verification/deprecated/old-sync-email-verification.profile'
import { EmailAdministrationController } from './api/http/email-administration/email-administration.controller'
import { EmailVerificationOrchestrator } from './application/email-verification.service'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
    SynchronousVerificationCore,
} from './application/delivery/synchronous/run-synchronous-verification'
import { VerificationResultsController } from './api/verification-results.controller'
import { VERIFICATION_RESULT_READER } from './application/verification-result-reader'
import { TypeOrmVerificationResultReader } from './infrastructure/typeorm-verification-result-reader'
import { EmailVerificationEntity } from './infrastructure/persistence/typeorm/email-verification.entity'

@Module({
    imports: [EmailVerificationCoreModule, AsyncEmailVerificationModule, BatchEmailVerificationModule, CreditsModule],
    controllers: [
        AsyncEmailVerificationController,
        SyncEmailVerificationController,
        OldSyncEmailVerificationController,
        EmailAdministrationController,
        VerificationResultsController,
    ],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        OldSyncEmailVerificationProfile,
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
    ],
})
export class EmailVerificationModule {}
