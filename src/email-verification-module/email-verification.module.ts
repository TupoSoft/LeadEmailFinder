import { Module } from '@nestjs/common'
import { SyncEmailVerificationModule } from './sync-email-verification'
import { AsyncEmailVerificationModule } from './async-email-verification'
import { BatchEmailVerificationModule } from './batch-email-verification'
import { OldSyncEmailVerificationModule } from './old-sync-email-verification'

@Module({
    imports: [
        SyncEmailVerificationModule,
        AsyncEmailVerificationModule,
        BatchEmailVerificationModule,
        OldSyncEmailVerificationModule,
    ],
})
export class EmailVerificationModule {}
