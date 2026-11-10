import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailEntity } from './persistence/typeorm/email.entity'
import { DomainPolicyEntity } from './persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from './persistence/typeorm/email-verification.entity'
import { VerificationRequestEntity } from './persistence/typeorm/verification-request.entity'
import { VerificationExecutionEntity } from './persistence/typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './persistence/typeorm/verification-settlement-intention.entity'
import { VerificationCommandOutboxEntity } from './persistence/typeorm/verification-command-outbox.entity'
import { TypeOrmEmailStore } from './persistence/typeorm-email.store'
import { TypeOrmDomainStore } from './persistence/typeorm-domain.store'
import { TypeOrmVerificationRequestStore } from './persistence/typeorm-verification-request.store'
import { TypeOrmVerificationExecutionStore } from './persistence/typeorm-verification-execution.store'
import { TypeOrmVerificationSettlementStore } from './persistence/typeorm-verification-settlement.store'
import { TypeOrmVerificationResultCacheReader } from './persistence/typeorm-verification-result-cache-reader'
import { EmailAdministrationService } from '../application/email-administration.service'
import { DomainPolicyService } from '../application/domain-policy.service'
import { VERIFICATION_CLOCK, VerificationClock } from '../application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from '../application/ports/verification-request-store'
import {
    VERIFICATION_EXECUTION_STORE,
    VerificationExecutionStore,
} from '../application/ports/verification-execution-store'
import {
    VERIFICATION_SETTLEMENT_STORE,
    VerificationSettlementStore,
} from '../application/ports/verification-settlement-store'
import {
    VERIFICATION_RESULT_CACHE_READER,
    VerificationResultCacheReader,
} from '../application/ports/verification-result-cache-reader'
import {
    VERIFICATION_COOLDOWN_READER,
    VerificationCooldownReader,
} from '../application/ports/verification-cooldown-reader'
import { VerificationAdmissionService } from '../application/operations/verification-admission.service'
import { VerificationSettlementService } from '../application/operations/verification-settlement.service'
import {
    VERIFICATION_ADDRESS_COOLDOWN_MS,
    VERIFICATION_EXECUTION_DEADLINE_MS,
} from '../application/operations/verification-execution-timing'

class SystemVerificationClock implements VerificationClock {
    now(): Date {
        return new Date()
    }
}

/** API-owned durable state and billing. Probe providers belong exclusively to apps/worker. */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            EmailEntity,
            DomainPolicyEntity,
            EmailVerificationEntity,
            VerificationRequestEntity,
            VerificationExecutionEntity,
            VerificationSettlementIntentionEntity,
            VerificationCommandOutboxEntity,
        ]),
        ConfigModule,
        CreditsModule,
    ],
    providers: [
        {
            provide: EmailAdministrationService,
            inject: [getRepositoryToken(EmailEntity)],
            useFactory: (repository: Repository<EmailEntity>) => {
                const emailStore = new TypeOrmEmailStore(repository)

                return new EmailAdministrationService(emailStore)
            },
        },
        {
            provide: DomainPolicyService,
            inject: [getRepositoryToken(DomainPolicyEntity)],
            useFactory: (repository: Repository<DomainPolicyEntity>) => {
                const domainStore = new TypeOrmDomainStore(repository)

                return new DomainPolicyService(domainStore)
            },
        },
        {
            provide: VERIFICATION_CLOCK,
            useClass: SystemVerificationClock,
        },
        {
            provide: VERIFICATION_REQUEST_STORE,
            inject: [DataSource],
            useFactory: (source: DataSource) => new TypeOrmVerificationRequestStore(source),
        },
        {
            provide: VERIFICATION_EXECUTION_STORE,
            inject: [DataSource],
            useFactory: (source: DataSource) => new TypeOrmVerificationExecutionStore(source),
        },
        {
            provide: VERIFICATION_SETTLEMENT_STORE,
            inject: [DataSource],
            useFactory: (source: DataSource) => new TypeOrmVerificationSettlementStore(source),
        },
        {
            provide: VERIFICATION_RESULT_CACHE_READER,
            inject: [DataSource],
            useFactory: (source: DataSource) => new TypeOrmVerificationResultCacheReader(source.manager),
        },
        {
            provide: VERIFICATION_COOLDOWN_READER,
            useExisting: VERIFICATION_RESULT_CACHE_READER,
        },
        {
            provide: VerificationAdmissionService,
            inject: [
                VERIFICATION_REQUEST_STORE,
                VERIFICATION_EXECUTION_STORE,
                VERIFICATION_RESULT_CACHE_READER,
                VERIFICATION_COOLDOWN_READER,
                CreditReservationService,
                VERIFICATION_CLOCK,
                ConfigService,
            ],
            useFactory: (
                requests: VerificationRequestStore,
                executions: VerificationExecutionStore,
                cache: VerificationResultCacheReader,
                cooldown: VerificationCooldownReader,
                credits: CreditReservationService,
                clock: VerificationClock,
                config: ConfigService,
            ) =>
                new VerificationAdmissionService(
                    requests,
                    executions,
                    cache,
                    cooldown,
                    credits,
                    clock,
                    (config.get<number>('VERIFICATION_RESULT_CACHE_TTL_SECONDS') ?? 86_400) * 1000,
                    VERIFICATION_EXECUTION_DEADLINE_MS,
                    VERIFICATION_ADDRESS_COOLDOWN_MS,
                ),
        },
        {
            provide: VerificationSettlementService,
            inject: [VERIFICATION_SETTLEMENT_STORE, CreditReservationService, EmailAdministrationService],
            useFactory: (
                settlements: VerificationSettlementStore,
                credits: CreditReservationService,
                administration: EmailAdministrationService,
            ) => new VerificationSettlementService(settlements, credits, administration),
        },
    ],
    exports: [
        EmailAdministrationService,
        DomainPolicyService,
        TypeOrmModule,
        VERIFICATION_CLOCK,
        VERIFICATION_REQUEST_STORE,
        VERIFICATION_EXECUTION_STORE,
        VERIFICATION_SETTLEMENT_STORE,
        VERIFICATION_RESULT_CACHE_READER,
        VERIFICATION_COOLDOWN_READER,
        VerificationAdmissionService,
        VerificationSettlementService,
    ],
})
export class EmailVerificationCoreModule {}
