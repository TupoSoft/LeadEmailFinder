import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { EmailVerificationOrchestrator } from '../../../application/email-verification.service'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VerificationTraceModule } from '../../verification-trace/verification-trace.module'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import {
    ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
} from './async-email-verification-queue.config'

/**
 * Owns only the `async-email-verification` queue and its worker now — kept solely for batch's child-verification
 * dispatch (`BullBatchChildFlow` enqueues directly into this queue by name; plan 05 removes this path). The
 * plain single-submission async route no longer uses this queue or its `AsyncVerificationJobs` port at all — see
 * `email-verification.module.ts` for the durable-stack composition that replaces it.
 */
@Module({
    imports: [
        VerificationTraceModule,
        EmailVerificationCoreModule,
        BullModule.registerQueue({
            name: ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
            defaultJobOptions: ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
        }),
    ],
    providers: [
        AsyncEmailVerificationProcessor,
        { provide: EMAIL_VERIFICATION_SERVICE_TOKEN, useExisting: EmailVerificationOrchestrator },
    ],
})
export class AsyncEmailVerificationModule {}
