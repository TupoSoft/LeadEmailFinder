import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { DataSource } from 'typeorm'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { VerificationExecutionModule } from '../verification-execution/verification-execution.module'
import { VerificationTraceModule } from '../../verification-trace/verification-trace.module'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../../../application/verification-trace/verification-trace-observer'
import { VERIFICATION_CLOCK, VerificationClock } from '../../../application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from '../../../application/ports/verification-request-store'
import { VERIFICATION_EXECUTION_STORE, VerificationExecutionStore } from '../../../application/ports/verification-execution-store'
import {
    VERIFICATION_RESULT_CACHE_READER,
    VerificationResultCacheReader,
} from '../../../application/ports/verification-result-cache-reader'
import { VERIFICATION_COOLDOWN_READER, VerificationCooldownReader } from '../../../application/ports/verification-cooldown-reader'
import {
    VERIFICATION_EXECUTION_DISPATCHER,
    VerificationExecutionDispatcher,
} from '../../../application/ports/verification-execution-dispatcher'
import { VERIFICATION_EXECUTION_DEADLINE_MS, VERIFICATION_ADDRESS_COOLDOWN_MS } from '../../../application/operations/verification-execution-timing'
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
import { TypeOrmBatchAdmissionStore } from '../../persistence/typeorm-batch-admission.store'
import { TypeOrmBatchRowStore } from '../../persistence/typeorm-batch-row.store'
import { BatchAdmissionEntity } from '../../persistence/typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from '../../persistence/typeorm/batch-unique-address.entity'
import { BatchRowEntity } from '../../persistence/typeorm/batch-row.entity'
import { BullBatchJobs } from './bull-batch-jobs'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

const DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS = 86_400

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([BatchAdmissionEntity, BatchUniqueAddressEntity, BatchRowEntity]),
        BullModule.registerQueue({ name: BATCH_EMAIL_VERIFICATION_QUEUE_NAME }),
        MulterModule.registerAsync({
            imports: [ConfigModule],
            useClass: MulterOptionsFactoryImpl,
        }),
        EmailVerificationCoreModule,
        VerificationExecutionModule,
        CreditsModule,
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
            provide: BATCH_ADMISSION_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmBatchAdmissionStore(dataSource),
        },
        {
            provide: BATCH_ROW_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmBatchRowStore(dataSource),
        },
        {
            provide: BatchAdmissionService,
            inject: [
                BATCH_ADMISSION_STORE,
                VERIFICATION_EXECUTION_STORE,
                VERIFICATION_REQUEST_STORE,
                VERIFICATION_RESULT_CACHE_READER,
                VERIFICATION_COOLDOWN_READER,
                CreditReservationService,
                VERIFICATION_CLOCK,
                ConfigService,
            ],
            useFactory: (
                admissions: BatchAdmissionStore,
                executions: VerificationExecutionStore,
                requests: VerificationRequestStore,
                cacheReader: VerificationResultCacheReader,
                cooldownReader: VerificationCooldownReader,
                credits: CreditReservationService,
                clock: VerificationClock,
                configService: ConfigService,
            ) =>
                new BatchAdmissionService(
                    admissions,
                    executions,
                    requests,
                    cacheReader,
                    cooldownReader,
                    credits,
                    clock,
                    (configService.get<number>('VERIFICATION_RESULT_CACHE_TTL_SECONDS') ??
                        DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS) * 1000,
                    VERIFICATION_EXECUTION_DEADLINE_MS,
                    VERIFICATION_ADDRESS_COOLDOWN_MS,
                ),
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
