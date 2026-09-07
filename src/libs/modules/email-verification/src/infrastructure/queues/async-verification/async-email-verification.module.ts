import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { EmailVerificationOrchestrator } from '../../../application/email-verification.service'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
} from '../../../application/delivery/async/async-email-verification.service'
import {
    ASYNC_VERIFICATION_JOBS,
    AsyncVerificationJobs,
} from '../../../application/delivery/async/async-verification-jobs'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../../../application/verification-trace/verification-trace-observer'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VerificationTraceModule } from '../../verification-trace/verification-trace.module'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import { BullAsyncVerificationJobs } from './bull-async-verification-jobs'
import {
    ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
} from './async-email-verification-queue.config'

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
        BullAsyncVerificationJobs,
        AsyncEmailVerificationProcessor,
        { provide: ASYNC_VERIFICATION_JOBS, useExisting: BullAsyncVerificationJobs },
        { provide: EMAIL_VERIFICATION_SERVICE_TOKEN, useExisting: EmailVerificationOrchestrator },
        {
            provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
            inject: [ASYNC_VERIFICATION_JOBS, VERIFICATION_TRACE_OBSERVER],
            useFactory: (jobs: AsyncVerificationJobs, observer: VerificationTraceObserver) =>
                new AsyncEmailVerificationService(jobs, observer),
        },
    ],
    exports: [ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN],
})
export class AsyncEmailVerificationModule {}
