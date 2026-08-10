import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AsyncEmailVerificationServiceImpl } from './async-email-verification-service-impl.service'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
} from './async-email-verification.constants'
import { AsyncEmailVerificationController } from './async-email-verification.controller'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'
import { CreditsModule } from '../../credits'

@Module({
    imports: [
        SyncEmailVerificationModule,
        BullModule.registerQueue({
            name: 'async-email-verification',
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: 'async-email-verification',
                },
            },
        }),
        ApiKeyModule,
        CreditsModule,
    ],
    providers: [
        AsyncEmailVerificationServiceImpl,
        AsyncEmailVerificationProcessor,
        {
            provide: EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: EmailVerificationService,
        },
        {
            provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: AsyncEmailVerificationServiceImpl,
        },
    ],
    controllers: [AsyncEmailVerificationController],
})
export class AsyncEmailVerificationModule {}
