import { Module } from '@nestjs/common'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'
import { OldSyncEmailVerificationProfile } from './old-sync-email-verification.profile'
import { KeyModule } from '@tuposoft/lead-email-finder/key'

@Module({
    imports: [SyncEmailVerificationModule, KeyModule],
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
