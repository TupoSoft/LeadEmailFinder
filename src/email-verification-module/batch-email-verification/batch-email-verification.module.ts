import { Module } from '@nestjs/common'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { BullModule } from '@nestjs/bullmq'

@Module({
    imports: [
        BullModule.registerQueue({ name: 'batch-email-verification' }),
        BullModule.registerQueue({ name: 'async-email-verification' }),
        BullModule.registerFlowProducer({ name: 'batch-email-verification-flow' }),
    ],
    controllers: [BatchEmailVerificationController],
})
export class BatchEmailVerificationModule {}
