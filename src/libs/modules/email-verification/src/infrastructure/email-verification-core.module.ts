import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { AccountDiscoveryModule } from './account-discovery/account-discovery.module'
import {
    ALLOCATION_OBSERVER_TOKEN,
    IAllocationObserver,
    IProxyAllocator,
    IProxyService,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_SERVICE_TOKEN,
    ProxyModule,
} from '@tuposoft/lead-email-finder/modules/proxy'
import { IDnsService } from '@tuposoft/lead-email-finder/common'
import { VerificationTraceModule } from './verification-trace/verification-trace.module'
import { AccountDiscovery, ACCOUNT_DISCOVERY_TOKEN } from '../application/ports/account-discovery'
import { EmailEntity } from './persistence/typeorm/email.entity'
import { DomainPolicyEntity } from './persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from './persistence/typeorm/email-verification.entity'
import { SmtpVerificationEntity } from './persistence/typeorm/smtp-verification.entity'
import { VerificationRequestEntity } from './persistence/typeorm/verification-request.entity'
import { VerificationExecutionEntity } from './persistence/typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './persistence/typeorm/verification-settlement-intention.entity'
import { VerificationExecutionPermitEntity } from './persistence/typeorm/verification-execution-permit.entity'
import { VerificationExecutionPermitLockEntity } from './persistence/typeorm/verification-execution-permit-lock.entity'
import { TypeOrmEmailStore } from './persistence/typeorm-email.store'
import { TypeOrmDomainStore } from './persistence/typeorm-domain.store'
import { TypeOrmVerificationStore } from './persistence/typeorm-verification.store'
import { TypeOrmSmtpVerificationStore } from './persistence/typeorm-smtp-verification.store'
import { TypeOrmVerificationRequestStore } from './persistence/typeorm-verification-request.store'
import { TypeOrmVerificationExecutionStore } from './persistence/typeorm-verification-execution.store'
import { TypeOrmVerificationSettlementStore } from './persistence/typeorm-verification-settlement.store'
import { TypeOrmVerificationResultCacheReader } from './persistence/typeorm-verification-result-cache-reader'
import { TypeOrmVerificationExecutionPermitStore } from './persistence/typeorm-verification-execution-permit.store'
import { DnsMxResolver } from './discovery/dns/dns-mx-resolver'
import { HttpDomainSynonymDiscovery } from './discovery/http/http-domain-synonym-discovery'
import { SmtpClientFactory } from './mailbox/smtp/smtp-client.factory'
import { SmtpMailboxProbe } from './mailbox/smtp/smtp-mailbox-probe'
import { EmailAdministrationService } from '../application/email-administration.service'
import { DomainPolicyService } from '../application/domain-policy.service'
import { MailboxVerificationService } from '../application/mailbox-verification.service'
import { EmailVerificationOrchestrator } from '../application/email-verification.service'
import { MX_RESOLVER, MxResolver } from '../application/ports/mx-resolver'
import { DOMAIN_SYNONYM_DISCOVERY } from '../application/ports/domain-synonym-discovery'
import { MAILBOX_PROBE } from '../application/ports/mailbox-probe'
import { VERIFICATION_CLOCK, VerificationClock } from '../application/ports/verification-clock'
import { VERIFICATION_REQUEST_STORE, VerificationRequestStore } from '../application/ports/verification-request-store'
import { VERIFICATION_EXECUTION_STORE, VerificationExecutionStore } from '../application/ports/verification-execution-store'
import { VERIFICATION_SETTLEMENT_STORE, VerificationSettlementStore } from '../application/ports/verification-settlement-store'
import {
    VERIFICATION_RESULT_CACHE_READER,
    VerificationResultCacheReader,
} from '../application/ports/verification-result-cache-reader'
import { VERIFICATION_COOLDOWN_READER, VerificationCooldownReader } from '../application/ports/verification-cooldown-reader'
import { VERIFICATION_EXECUTION_PERMITS, VerificationExecutionPermits } from '../application/ports/verification-execution-permits'
import { VerificationAdmissionService } from '../application/operations/verification-admission.service'
import { VerificationSettlementService } from '../application/operations/verification-settlement.service'
import { VerificationExecutionRunner } from '../application/operations/verification-execution-runner'
import {
    VERIFICATION_ADDRESS_COOLDOWN_MS,
    VERIFICATION_EXECUTION_DEADLINE_MS,
    VERIFICATION_LEASE_DURATION_MS,
    VERIFICATION_LEASE_LIVENESS_POLL_MS,
} from '../application/operations/verification-execution-timing'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../application/verification-trace/verification-trace-observer'

const DEFAULT_VERIFICATION_RESULT_CACHE_TTL_SECONDS = 86_400
const DEFAULT_VERIFICATION_EXECUTION_MAX_CONCURRENT = 5

class SystemVerificationClock implements VerificationClock {
    now(): Date {
        return new Date()
    }
}

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([
            EmailEntity,
            DomainPolicyEntity,
            EmailVerificationEntity,
            SmtpVerificationEntity,
            VerificationRequestEntity,
            VerificationExecutionEntity,
            VerificationSettlementIntentionEntity,
            VerificationExecutionPermitEntity,
            VerificationExecutionPermitLockEntity,
        ]),
        ConfigModule,
        DnsModule,
        HttpModule,
        ProxyModule,
        AccountDiscoveryModule,
        CreditsModule,
    ],
    providers: [
        {
            provide: EmailAdministrationService,
            inject: [getRepositoryToken(EmailEntity)],
            useFactory: (repository: Repository<EmailEntity>) =>
                new EmailAdministrationService(new TypeOrmEmailStore(repository)),
        },
        {
            provide: DomainPolicyService,
            inject: [getRepositoryToken(DomainPolicyEntity)],
            useFactory: (repository: Repository<DomainPolicyEntity>) =>
                new DomainPolicyService(new TypeOrmDomainStore(repository)),
        },
        {
            provide: MX_RESOLVER,
            inject: [DnsService],
            useFactory: (dnsService: DnsService) => new DnsMxResolver(dnsService),
        },
        HttpDomainSynonymDiscovery,
        {
            provide: DOMAIN_SYNONYM_DISCOVERY,
            useExisting: HttpDomainSynonymDiscovery,
        },
        SmtpClientFactory,
        {
            provide: VERIFICATION_CLOCK,
            useClass: SystemVerificationClock,
        },
        {
            provide: MAILBOX_PROBE,
            inject: [
                DnsService,
                MX_RESOLVER,
                PROXY_SERVICE_TOKEN,
                PROXY_ALLOCATOR_TOKEN,
                SmtpClientFactory,
                getRepositoryToken(SmtpVerificationEntity),
                ALLOCATION_OBSERVER_TOKEN,
                VERIFICATION_CLOCK,
            ],
            useFactory: (
                dnsService: IDnsService,
                mxResolver: MxResolver,
                proxyService: IProxyService,
                proxyAllocator: IProxyAllocator,
                smtpClientFactory: SmtpClientFactory,
                smtpVerificationRepository: Repository<SmtpVerificationEntity>,
                allocationObserver: IAllocationObserver,
                clock: VerificationClock,
            ) =>
                new SmtpMailboxProbe(
                    dnsService,
                    mxResolver,
                    proxyService,
                    proxyAllocator,
                    smtpClientFactory,
                    new TypeOrmSmtpVerificationStore(smtpVerificationRepository),
                    allocationObserver,
                    clock,
                ),
        },
        {
            provide: MailboxVerificationService,
            inject: [MAILBOX_PROBE, ACCOUNT_DISCOVERY_TOKEN],
            useFactory: (mailboxProbe: SmtpMailboxProbe, accountDiscovery: AccountDiscovery) =>
                new MailboxVerificationService(mailboxProbe, accountDiscovery),
        },
        {
            provide: EmailVerificationOrchestrator,
            inject: [
                MailboxVerificationService,
                getRepositoryToken(EmailVerificationEntity),
                EmailAdministrationService,
                DomainPolicyService,
                VERIFICATION_TRACE_OBSERVER,
            ],
            useFactory: (
                mailboxVerification: MailboxVerificationService,
                verificationRepository: Repository<EmailVerificationEntity>,
                emailAdministration: EmailAdministrationService,
                domainPolicy: DomainPolicyService,
                traceObserver: VerificationTraceObserver,
            ) =>
                new EmailVerificationOrchestrator(
                    mailboxVerification,
                    new TypeOrmVerificationStore(verificationRepository),
                    emailAdministration,
                    domainPolicy,
                    traceObserver,
                ),
        },
        {
            provide: VERIFICATION_REQUEST_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationRequestStore(dataSource),
        },
        {
            provide: VERIFICATION_EXECUTION_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationExecutionStore(dataSource),
        },
        {
            provide: VERIFICATION_SETTLEMENT_STORE,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationSettlementStore(dataSource),
        },
        {
            provide: VERIFICATION_RESULT_CACHE_READER,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationResultCacheReader(dataSource.manager),
        },
        {
            provide: VERIFICATION_COOLDOWN_READER,
            useExisting: VERIFICATION_RESULT_CACHE_READER,
        },
        {
            provide: VERIFICATION_EXECUTION_PERMITS,
            inject: [DataSource],
            useFactory: (dataSource: DataSource) => new TypeOrmVerificationExecutionPermitStore(dataSource),
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
                cacheReader: VerificationResultCacheReader,
                cooldownReader: VerificationCooldownReader,
                credits: CreditReservationService,
                clock: VerificationClock,
                configService: ConfigService,
            ) =>
                new VerificationAdmissionService(
                    requests,
                    executions,
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
            provide: VerificationSettlementService,
            inject: [VERIFICATION_SETTLEMENT_STORE, CreditReservationService, EmailAdministrationService],
            useFactory: (
                settlements: VerificationSettlementStore,
                credits: CreditReservationService,
                emailAdministration: EmailAdministrationService,
            ) => new VerificationSettlementService(settlements, credits, emailAdministration),
        },
        {
            provide: VerificationExecutionRunner,
            inject: [
                VERIFICATION_EXECUTION_STORE,
                VERIFICATION_SETTLEMENT_STORE,
                VerificationSettlementService,
                MailboxVerificationService,
                VERIFICATION_CLOCK,
                VERIFICATION_EXECUTION_PERMITS,
                ConfigService,
            ],
            useFactory: (
                executions: VerificationExecutionStore,
                settlements: VerificationSettlementStore,
                settlementService: VerificationSettlementService,
                mailboxVerification: MailboxVerificationService,
                clock: VerificationClock,
                permits: VerificationExecutionPermits,
                configService: ConfigService,
            ) =>
                new VerificationExecutionRunner(
                    executions,
                    settlements,
                    settlementService,
                    mailboxVerification,
                    clock,
                    permits,
                    VERIFICATION_LEASE_DURATION_MS,
                    VERIFICATION_LEASE_LIVENESS_POLL_MS,
                    configService.get<number>('VERIFICATION_EXECUTION_MAX_CONCURRENT') ??
                        DEFAULT_VERIFICATION_EXECUTION_MAX_CONCURRENT,
                ),
        },
    ],
    exports: [
        EmailVerificationOrchestrator,
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
        VerificationExecutionRunner,
    ],
})
export class EmailVerificationCoreModule {}
