import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule, CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VerificationTraceModule } from '../../verification-trace/verification-trace.module'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../../../application/verification-trace/verification-trace-observer'
import { BATCH_INPUT, BatchInput } from '../../../application/delivery/batch/batch-input'
import { BATCH_CHILD_FLOW, BatchChildFlow } from '../../../application/delivery/batch/batch-child-flow'
import { BATCH_RESULT_WRITER, BatchResultWriter } from '../../../application/delivery/batch/batch-result-writer'
import { BATCH_RESULT_READER, BatchResultReader } from '../../../application/delivery/batch/batch-result-reader'
import { BATCH_JOBS, BatchJobs } from '../../../application/delivery/batch/batch-jobs'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import {
    BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
    BatchEmailVerificationService,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { S3BatchInput } from '../../storage/batch-verification/s3-batch-input'
import { S3BatchResultWriter } from '../../storage/batch-verification/s3-batch-result-writer'
import { S3BatchResultReader } from '../../storage/batch-verification/s3-batch-result-reader'
import { MulterOptionsFactoryImpl } from '../../storage/batch-verification/multer-options-factory-impl.service'
import { BullBatchJobs } from './bull-batch-jobs'
import { BullBatchChildFlow } from './bull-batch-child-flow'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

@Module({
    imports: [
        VerificationTraceModule,
        BullModule.registerQueue({ name: BATCH_EMAIL_VERIFICATION_QUEUE_NAME }),
        BullModule.registerQueue({ name: 'async-email-verification' }),
        MulterModule.registerAsync({
            imports: [ConfigModule],
            useClass: MulterOptionsFactoryImpl,
        }),
        EmailVerificationCoreModule,
        CreditsModule,
    ],
    providers: [
        S3BatchInput,
        S3BatchResultWriter,
        S3BatchResultReader,
        BullBatchJobs,
        BullBatchChildFlow,
        { provide: BATCH_INPUT, useExisting: S3BatchInput },
        { provide: BATCH_RESULT_WRITER, useExisting: S3BatchResultWriter },
        { provide: BATCH_RESULT_READER, useExisting: S3BatchResultReader },
        { provide: BATCH_JOBS, useExisting: BullBatchJobs },
        { provide: BATCH_CHILD_FLOW, useExisting: BullBatchChildFlow },
        {
            provide: BatchEmailVerificationWorkflow,
            inject: [BATCH_INPUT, BATCH_CHILD_FLOW, BATCH_RESULT_WRITER, CreditsService, VERIFICATION_TRACE_OBSERVER],
            useFactory: (
                input: BatchInput,
                childFlow: BatchChildFlow,
                resultWriter: BatchResultWriter,
                creditsService: CreditsService,
                traceObserver: VerificationTraceObserver,
            ) => new BatchEmailVerificationWorkflow(input, childFlow, resultWriter, creditsService, traceObserver),
        },
        BatchEmailVerificationProcessor,
        {
            provide: BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
            inject: [BATCH_JOBS, BATCH_RESULT_READER, VERIFICATION_TRACE_OBSERVER],
            useFactory: (jobs: BatchJobs, resultReader: BatchResultReader, traceObserver: VerificationTraceObserver) =>
                new BatchEmailVerificationService(jobs, resultReader, traceObserver),
        },
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    exports: [BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN, MulterModule],
})
export class BatchEmailVerificationModule {}
