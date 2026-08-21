import { Module } from '@nestjs/common'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'
import { OldSyncEmailVerificationProfile } from './old-sync-email-verification.profile'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'

@Module({
    imports: [SyncEmailVerificationModule, CreditsModule],
    controllers: [OldSyncEmailVerificationController],
    providers: [
        {
            provide: 'EmailVerificationServiceToken',
            useExisting: EmailVerificationService,
        },
        OldSyncEmailVerificationProfile,
        RolePermissionPolicy,
        PermissionsGuard,
    ],
})
export class OldSyncEmailVerificationModule {}
