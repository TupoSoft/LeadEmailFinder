import { Module } from '@nestjs/common'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'

@Module({
    imports: [SyncEmailVerificationModule],
    controllers: [OldSyncEmailVerificationController],
    providers: [
        {
            provide: 'EmailVerificationServiceToken',
            useExisting: EmailVerificationService,
        },
    ],
})
export class OldSyncEmailVerificationModule {}
