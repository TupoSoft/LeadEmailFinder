import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import {
    CatchAllModule,
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
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
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationTraceModule } from '../infrastructure/verification-trace/verification-trace.module'
import { AccountDiscovery, ACCOUNT_DISCOVERY_TOKEN } from '../application/ports/account-discovery'
import {
    ACCOUNT_DISCOVERY_CLOCK_TOKEN,
    SYSTEM_CLOCK,
    configuredAccountDiscovery,
} from '../infrastructure/account-discovery/configured-account-discovery'
import { EmailEntity } from '../infrastructure/persistence/typeorm/email.entity'
import { DomainPolicyEntity } from '../infrastructure/persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from '../infrastructure/persistence/typeorm/email-verification.entity'
import { SmtpVerificationEntity } from '../infrastructure/persistence/typeorm/smtp-verification.entity'
import { TypeOrmEmailStore } from '../infrastructure/persistence/typeorm-email.store'
import { TypeOrmDomainStore } from '../infrastructure/persistence/typeorm-domain.store'
import { TypeOrmVerificationStore } from '../infrastructure/persistence/typeorm-verification.store'
import { TypeOrmSmtpVerificationStore } from '../infrastructure/persistence/typeorm-smtp-verification.store'
import { DnsMxResolver } from '../infrastructure/discovery/dns/dns-mx-resolver'
import { HttpDomainSynonymDiscovery } from '../infrastructure/discovery/http/http-domain-synonym-discovery'
import { SmtpClientFactory } from '../infrastructure/mailbox/smtp/smtp-client.factory'
import { SmtpMailboxProbe } from '../infrastructure/mailbox/smtp/smtp-mailbox-probe'
import { EmailAdministrationService } from '../application/email-administration.service'
import { DomainPolicyService } from '../application/domain-policy.service'
import { MailboxVerificationService } from '../application/mailbox-verification.service'
import { EmailVerificationOrchestrator } from '../application/email-verification.service'
import { MX_RESOLVER, MxResolver } from '../application/ports/mx-resolver'
import { DOMAIN_SYNONYM_DISCOVERY } from '../application/ports/domain-synonym-discovery'
import { MAILBOX_PROBE } from '../application/ports/mailbox-probe'
import { VERIFICATION_TRACE_OBSERVER, VerificationTraceObserver } from '../application/verification-trace/verification-trace-observer'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { SyncEmailVerificationController } from './sync-email-verification.controller'
import { EmailAdministrationController } from '../api/http/email-administration/email-administration.controller'

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([EmailEntity, DomainPolicyEntity, EmailVerificationEntity, SmtpVerificationEntity]),
        ConfigModule,
        DnsModule,
        HttpModule,
        ProxyModule,
        CatchAllModule,
        CreditsModule,
    ],
    controllers: [SyncEmailVerificationController, EmailAdministrationController],
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
            provide: ACCOUNT_DISCOVERY_CLOCK_TOKEN,
            useValue: SYSTEM_CLOCK,
        },
        {
            provide: ACCOUNT_DISCOVERY_TOKEN,
            useFactory: configuredAccountDiscovery,
            inject: [
                ConfigService,
                ACCOUNT_DISCOVERY_CLOCK_TOKEN,
                MicrosoftGetCredentialType,
                MicrosoftLogin,
                MimecastLogin,
                OfficeApps,
            ],
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
            ],
            useFactory: (
                dnsService: IDnsService,
                mxResolver: MxResolver,
                proxyService: IProxyService,
                proxyAllocator: IProxyAllocator,
                smtpClientFactory: SmtpClientFactory,
                smtpVerificationRepository: Repository<SmtpVerificationEntity>,
                allocationObserver: IAllocationObserver,
            ) =>
                new SmtpMailboxProbe(
                    dnsService,
                    mxResolver,
                    proxyService,
                    proxyAllocator,
                    smtpClientFactory,
                    new TypeOrmSmtpVerificationStore(smtpVerificationRepository),
                    allocationObserver,
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
            provide: EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: EmailVerificationOrchestrator,
        },
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    exports: [EmailVerificationOrchestrator, EmailAdministrationService, DomainPolicyService, TypeOrmModule],
})
export class SyncEmailVerificationModule {}
