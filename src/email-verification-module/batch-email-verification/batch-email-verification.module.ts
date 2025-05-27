import { Module } from '@nestjs/common'
import { BatchEmailVerificationController } from './batch-email-verification.controller'

@Module({
    controllers: [BatchEmailVerificationController],
})
export class BatchEmailVerificationModule {}
