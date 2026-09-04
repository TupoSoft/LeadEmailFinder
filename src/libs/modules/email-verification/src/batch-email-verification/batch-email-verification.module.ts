import { VerificationTraceModule } from '../infrastructure/verification-trace/verification-trace.module'
import { Module } from '@nestjs/common'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { BullModule } from '@nestjs/bullmq'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { MulterModule } from '@nestjs/platform-express'
import { MulterOptionsFactoryImpl } from './multer-options-factory-impl.service'
import { SyncEmailVerificationModule } from '../sync-email-verification'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification.constants'
import { ConfigModule } from '@nestjs/config'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'

@Module({
    imports: [
        VerificationTraceModule,
        BullModule.registerQueue({ name: BATCH_EMAIL_VERIFICATION_QUEUE_NAME }),
        BullModule.registerQueue({ name: 'async-email-verification' }),
        MulterModule.registerAsync({
            imports: [ConfigModule],
            useClass: MulterOptionsFactoryImpl,
        }),
        SyncEmailVerificationModule,
        CreditsModule,
    ],
    controllers: [BatchEmailVerificationController],
    providers: [
        BatchEmailVerificationServiceImpl,
        BatchEmailVerificationProcessor,
        {
            provide: 'BatchEmailVerificationServiceToken',
            useExisting: BatchEmailVerificationServiceImpl,
        },
        RolePermissionPolicy,
        PermissionsGuard,
    ],
})
export class BatchEmailVerificationModule {}
