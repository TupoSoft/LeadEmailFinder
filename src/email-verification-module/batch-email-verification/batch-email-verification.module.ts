import { Module } from '@nestjs/common'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { BullModule } from '@nestjs/bullmq'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { MulterModule } from '@nestjs/platform-express'
import { MulterOptionsFactoryImpl } from './multer-options-factory-impl.service'

@Module({
    imports: [
        BullModule.registerQueue({ name: 'batch-email-verification' }),
        BullModule.registerQueue({ name: 'async-email-verification' }),
        BullModule.registerFlowProducer({ name: 'batch-email-verification-flow' }),
        MulterModule.registerAsync({
            useClass: MulterOptionsFactoryImpl,
        }),
    ],
    controllers: [BatchEmailVerificationController],
    providers: [
        BatchEmailVerificationServiceImpl,
        BatchEmailVerificationProcessor,
        {
            provide: 'BatchEmailVerificationServiceToken',
            useExisting: BatchEmailVerificationServiceImpl,
        },
    ],
})
export class BatchEmailVerificationModule {}
