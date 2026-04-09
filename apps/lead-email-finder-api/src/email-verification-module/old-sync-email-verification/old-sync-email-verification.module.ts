import { Module } from '@nestjs/common'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'
import { OldSyncEmailVerificationProfile } from './old-sync-email-verification.profile'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [SyncEmailVerificationModule, ApiKeyModule],
    controllers: [OldSyncEmailVerificationController],
    providers: [
        {
            provide: 'EmailVerificationServiceToken',
            useExisting: EmailVerificationService,
        },
        OldSyncEmailVerificationProfile,
    ],
})
export class OldSyncEmailVerificationModule {}
