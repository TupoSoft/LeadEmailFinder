import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { DataSource } from 'typeorm'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { BatchAdmissionModule } from '../../batch-admission.module'
import { VerificationExecutionModule } from '../verification-execution/verification-execution.module'
import { VerificationTraceModule } from '../../verification-trace/verification-trace.module'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../../../application/verification-trace/verification-trace-observer'
import {
    VERIFICATION_EXECUTION_DISPATCHER,
    VerificationExecutionDispatcher,
} from '../../../application/ports/verification-execution-dispatcher'
import { BATCH_INPUT, BatchInput } from '../../../application/delivery/batch/batch-input'
import { BATCH_ROW_STORE, BatchRowStore } from '../../../application/delivery/batch/batch-row-store'
import { BATCH_ADMISSION_STORE, BatchAdmissionStore } from '../../../application/delivery/batch/batch-admission-store'
import { BatchAdmissionService } from '../../../application/delivery/batch/batch-admission.service'
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
import { TypeOrmBatchRowStore } from '../../persistence/typeorm-batch-row.store'
import { BatchRowEntity } from '../../persistence/typeorm/batch-row.entity'
import { BullBatchJobs } from './bull-batch-jobs'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([BatchRowEntity]),
        BatchAdmissionModule,
        BullModule.registerQueue({ name: BATCH_EMAIL_VERIFICATION_QUEUE_NAME }),
        MulterModule.registerAsync({
            imports: [ConfigModule],
            useClass: MulterOptionsFactoryImpl,
        }),
        EmailVerificationCoreModule,
        VerificationExecutionModule,
        ConfigModule,
    ],
    providers: [
        S3BatchInput,
        S3BatchResultWriter,
        S3BatchResultReader,
        BullBatchJobs,
        { provide: BATCH_INPUT, useExisting: S3BatchInput },
        { provide: BATCH_RESULT_WRITER, useExisting: S3BatchResultWriter },
        { provide: BATCH_RESULT_READER, useExisting: S3BatchResultReader },
        { provide: BATCH_JOBS, useExisting: BullBatchJobs },
        {
            provide: BATCH_ROW_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmBatchRowStore(dataSource),
        },
        {
            provide: BatchEmailVerificationWorkflow,
            inject: [
                BATCH_INPUT,
                BATCH_ROW_STORE,
                BATCH_ADMISSION_STORE,
                BatchAdmissionService,
                VERIFICATION_EXECUTION_DISPATCHER,
                BATCH_RESULT_WRITER,
                VERIFICATION_TRACE_OBSERVER,
            ],
            useFactory: (
                input: BatchInput,
                rows: BatchRowStore,
                admissions: BatchAdmissionStore,
                admissionService: BatchAdmissionService,
                dispatcher: VerificationExecutionDispatcher,
                resultWriter: BatchResultWriter,
                traceObserver: VerificationTraceObserver,
            ) =>
                new BatchEmailVerificationWorkflow(
                    input,
                    rows,
                    admissions,
                    admissionService,
                    dispatcher,
                    resultWriter,
                    traceObserver,
                ),
        },
        BatchEmailVerificationProcessor,
        {
            provide: BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
            inject: [BATCH_JOBS, BATCH_RESULT_READER, BATCH_ADMISSION_STORE, VERIFICATION_TRACE_OBSERVER],
            useFactory: (
                jobs: BatchJobs,
                resultReader: BatchResultReader,
                admissions: BatchAdmissionStore,
                traceObserver: VerificationTraceObserver,
            ) => new BatchEmailVerificationService(jobs, resultReader, admissions, traceObserver),
        },
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    exports: [BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN, MulterModule],
})
export class BatchEmailVerificationModule {}
