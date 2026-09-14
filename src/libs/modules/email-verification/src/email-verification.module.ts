import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from './infrastructure/email-verification-core.module'
import { AsyncEmailVerificationModule } from './infrastructure/queues/async-verification/async-email-verification.module'
import { AsyncEmailVerificationController } from './api/http/asynchronous-verification/async-email-verification.controller'
import { BatchEmailVerificationModule } from './infrastructure/queues/batch-verification/batch-email-verification.module'
import { BatchEmailVerificationController } from './api/http/batch-verification/batch-email-verification.controller'
import { SyncEmailVerificationController } from './api/http/synchronous-verification/current/sync-email-verification.controller'
import { EmailAdministrationController } from './api/http/email-administration/email-administration.controller'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
} from './application/delivery/synchronous/run-synchronous-verification'
import { VerificationResultsController } from './api/verification-results.controller'
import { VERIFICATION_RESULT_READER, VerificationResultReader } from './application/verification-result-reader'
import { TypeOrmVerificationResultReader } from './infrastructure/typeorm-verification-result-reader'
import { VERIFICATION_CLOCK, VerificationClock } from './application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from './application/ports/verification-request-store'
import { VERIFICATION_EXECUTION_STORE, VerificationExecutionStore } from './application/ports/verification-execution-store'
import { VerificationOperationsReader } from './application/operations/verification-operations-reader'
import { VerificationAdmissionService } from './application/operations/verification-admission.service'
import { VerificationExecutionRunner } from './application/operations/verification-execution-runner'
import {
    VERIFICATION_SYNC_EXECUTION_BUDGET_MS,
    VERIFICATION_SYNC_POLL_INTERVAL_MS,
} from './application/operations/verification-execution-timing'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
} from './application/delivery/async/async-email-verification.service'
import { VERIFICATION_EXECUTION_DISPATCHER, VerificationExecutionDispatcher } from './application/ports/verification-execution-dispatcher'
import { VERIFICATION_SUBMISSION_LIMITER } from './application/ports/verification-submission-limiter'
import { RedisVerificationSubmissionLimiter } from './infrastructure/redis/redis-verification-submission-limiter'
import {
    VerificationRateLimitGuard,
    VERIFICATION_SUBMISSION_RATE_CAPACITY,
    VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND,
} from './api/http/verification-rate-limit.guard'
import { VerificationReconciliationModule } from './infrastructure/queues/verification-reconciliation/verification-reconciliation.module'
import { VerificationExecutionModule } from './infrastructure/queues/verification-execution/verification-execution.module'

const DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS = 86_400
const DEFAULT_VERIFICATION_SUBMISSION_RATE_CAPACITY = 60
const DEFAULT_VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND = 1

@Module({
    imports: [
        ConfigModule,
        EmailVerificationCoreModule,
        AsyncEmailVerificationModule,
        BatchEmailVerificationModule,
        CreditsModule,
        VerificationReconciliationModule,
        VerificationExecutionModule,
    ],
    controllers: [
        AsyncEmailVerificationController,
        BatchEmailVerificationController,
        SyncEmailVerificationController,
        EmailAdministrationController,
        VerificationResultsController,
    ],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: RUN_SYNCHRONOUS_VERIFICATION,
            inject: [VerificationAdmissionService, VerificationExecutionRunner, VerificationOperationsReader, VERIFICATION_CLOCK, ConfigService],
            useFactory: (
                admission: VerificationAdmissionService,
                runner: VerificationExecutionRunner,
                operations: VerificationOperationsReader,
                clock: VerificationClock,
                configService: ConfigService,
            ) =>
                new RunSynchronousVerification(
                    admission,
                    runner,
                    operations,
                    clock,
                    VERIFICATION_SYNC_EXECUTION_BUDGET_MS,
                    VERIFICATION_SYNC_POLL_INTERVAL_MS,
                    (configService.get<number>('VERIFICATION_RESULT_CACHE_TTL_SECONDS') ??
                        DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS) * 1000,
                ),
        },
        {
            provide: VERIFICATION_RESULT_READER,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationResultReader(dataSource.manager),
        },
        {
            provide: VerificationOperationsReader,
            inject: [VERIFICATION_REQUEST_STORE, VERIFICATION_EXECUTION_STORE, VERIFICATION_RESULT_READER, VERIFICATION_CLOCK],
            useFactory: (
                requests: VerificationRequestStore,
                executions: VerificationExecutionStore,
                results: VerificationResultReader,
                clock: VerificationClock,
            ) => new VerificationOperationsReader(requests, executions, results, clock),
        },
        {
            provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
            inject: [VerificationAdmissionService, VERIFICATION_EXECUTION_DISPATCHER, VerificationOperationsReader, ConfigService],
            useFactory: (
                admission: VerificationAdmissionService,
                dispatcher: VerificationExecutionDispatcher,
                operations: VerificationOperationsReader,
                configService: ConfigService,
            ) =>
                new AsyncEmailVerificationService(
                    admission,
                    dispatcher,
                    operations,
                    (configService.get<number>('VERIFICATION_RESULT_CACHE_TTL_SECONDS') ??
                        DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS) * 1000,
                ),
        },
        RedisVerificationSubmissionLimiter,
        { provide: VERIFICATION_SUBMISSION_LIMITER, useExisting: RedisVerificationSubmissionLimiter },
        {
            provide: VERIFICATION_SUBMISSION_RATE_CAPACITY,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                configService.get<number>('VERIFICATION_SUBMISSION_RATE_CAPACITY') ??
                DEFAULT_VERIFICATION_SUBMISSION_RATE_CAPACITY,
        },
        {
            provide: VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                configService.get<number>('VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND') ??
                DEFAULT_VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND,
        },
        VerificationRateLimitGuard,
    ],
    exports: [VerificationOperationsReader],
})
export class EmailVerificationModule {}
