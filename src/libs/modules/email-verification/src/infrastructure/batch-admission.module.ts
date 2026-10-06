import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailVerificationCoreModule } from './email-verification-core.module'
import { VERIFICATION_CLOCK, VerificationClock } from '../application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from '../application/ports/verification-request-store'
import {
    VERIFICATION_EXECUTION_STORE,
    VerificationExecutionStore,
} from '../application/ports/verification-execution-store'
import {
    VERIFICATION_RESULT_CACHE_READER,
    VerificationResultCacheReader,
} from '../application/ports/verification-result-cache-reader'
import {
    VERIFICATION_COOLDOWN_READER,
    VerificationCooldownReader,
} from '../application/ports/verification-cooldown-reader'
import { BATCH_ADMISSION_RECOVERY } from '../application/ports/batch-admission-recovery'
import {
    VERIFICATION_ADDRESS_COOLDOWN_MS,
    VERIFICATION_EXECUTION_DEADLINE_MS,
    VERIFICATION_LEASE_DURATION_MS,
    VERIFICATION_LEASE_LIVENESS_POLL_MS,
} from '../application/operations/verification-execution-timing'
import { BATCH_ADMISSION_STORE, BatchAdmissionStore } from '../application/delivery/batch/batch-admission-store'
import { BatchAdmissionService } from '../application/delivery/batch/batch-admission.service'
import { BatchAdmissionRecoveryService } from '../application/delivery/batch/batch-admission-recovery.service'
import { TypeOrmBatchAdmissionStore } from './persistence/typeorm-batch-admission.store'
import { BatchAdmissionEntity } from './persistence/typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from './persistence/typeorm/batch-unique-address.entity'

const DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS = 86_400

/**
 * Batch group admission and its recovery, shared by the batch queue and the reconciliation queue without either
 * importing the other. Internal to the email-verification module; nothing here is part of its public barrel.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([BatchAdmissionEntity, BatchUniqueAddressEntity]),
        EmailVerificationCoreModule,
        CreditsModule,
        ConfigModule,
    ],
    providers: [
        {
            provide: BATCH_ADMISSION_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmBatchAdmissionStore(dataSource),
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
                    VERIFICATION_LEASE_DURATION_MS,
                    VERIFICATION_LEASE_LIVENESS_POLL_MS,
                ),
        },
        {
            provide: BATCH_ADMISSION_RECOVERY,
            inject: [BATCH_ADMISSION_STORE, BatchAdmissionService, VERIFICATION_CLOCK],
            useFactory: (admissions: BatchAdmissionStore, admission: BatchAdmissionService, clock: VerificationClock) =>
                new BatchAdmissionRecoveryService(admissions, admission, clock),
        },
    ],
    exports: [BATCH_ADMISSION_STORE, BatchAdmissionService, BATCH_ADMISSION_RECOVERY],
})
export class BatchAdmissionModule {}
