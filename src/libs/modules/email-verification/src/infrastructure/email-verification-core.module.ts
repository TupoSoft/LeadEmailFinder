import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
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
import { TypeOrmEmailStore } from './persistence/typeorm-email.store'
import { TypeOrmDomainStore } from './persistence/typeorm-domain.store'
import { TypeOrmVerificationStore } from './persistence/typeorm-verification.store'
import { TypeOrmSmtpVerificationStore } from './persistence/typeorm-smtp-verification.store'
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
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../application/verification-trace/verification-trace-observer'

class SystemVerificationClock implements VerificationClock {
    now(): Date {
        return new Date()
    }
}

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([EmailEntity, DomainPolicyEntity, EmailVerificationEntity, SmtpVerificationEntity]),
        ConfigModule,
        DnsModule,
        HttpModule,
        ProxyModule,
        AccountDiscoveryModule,
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
    ],
    exports: [EmailVerificationOrchestrator, EmailAdministrationService, DomainPolicyService, TypeOrmModule],
})
export class EmailVerificationCoreModule {}
