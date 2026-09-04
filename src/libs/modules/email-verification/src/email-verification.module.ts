import { Module } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { SyncEmailVerificationModule } from './sync-email-verification'
import { AsyncEmailVerificationModule } from './async-email-verification'
import { BatchEmailVerificationModule } from './batch-email-verification'
import { OldSyncEmailVerificationModule } from './old-sync-email-verification'
import { VerificationResultsController } from './api/verification-results.controller'
import { VERIFICATION_RESULT_READER } from './application/verification-result-reader'
import { TypeOrmVerificationResultReader } from './infrastructure/typeorm-verification-result-reader'
import { EmailVerification } from './sync-email-verification/email-verification.entity'

@Module({
    imports: [
        SyncEmailVerificationModule,
        AsyncEmailVerificationModule,
        BatchEmailVerificationModule,
        OldSyncEmailVerificationModule,
    ],
    controllers: [VerificationResultsController],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: VERIFICATION_RESULT_READER,
            inject: [getRepositoryToken(EmailVerification)],
            useFactory: (repository: Repository<EmailVerification>) => new TypeOrmVerificationResultReader(repository),
        },
    ],
})
export class EmailVerificationModule {}
