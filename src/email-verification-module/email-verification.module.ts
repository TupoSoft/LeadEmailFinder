import { Module } from '@nestjs/common'
import { SyncEmailVerificationModule } from './sync-email-verification'
// import { AsyncEmailVerificationModule } from './async-email-verification'

@Module({
    imports: [SyncEmailVerificationModule],
})
export class EmailVerificationModule {}
