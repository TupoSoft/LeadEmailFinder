import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { ICatchAllVerifier, ISmtpVerifier } from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationTraceModule } from '../infrastructure/verification-trace/verification-trace.module'
import { EmailVerifierModule } from '../email-verifier'
import { CATCH_ALL_VERIFIERS_TOKEN } from '../email-verifier/email-verifier.constants'
import { SmtpVerifier } from '../email-verifier/smtp'
import { EmailEntity } from '../infrastructure/persistence/typeorm/email.entity'
import { DomainPolicyEntity } from '../infrastructure/persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from '../infrastructure/persistence/typeorm/email-verification.entity'
import { TypeOrmEmailStore } from '../infrastructure/persistence/typeorm-email.store'
import { TypeOrmDomainStore } from '../infrastructure/persistence/typeorm-domain.store'
import { TypeOrmVerificationStore } from '../infrastructure/persistence/typeorm-verification.store'
import { DnsMxResolver } from '../infrastructure/discovery/dns/dns-mx-resolver'
import { HttpDomainSynonymDiscovery } from '../infrastructure/discovery/http/http-domain-synonym-discovery'
import { CompatibilityMailboxProbe } from '../infrastructure/compatibility-mailbox-probe'
import { EmailAdministrationService } from '../application/email-administration.service'
import { DomainPolicyService } from '../application/domain-policy.service'
import { MailboxVerificationService } from '../application/mailbox-verification.service'
import { EmailVerificationOrchestrator } from '../application/email-verification.service'
import { MX_RESOLVER } from '../application/ports/mx-resolver'
import { DOMAIN_SYNONYM_DISCOVERY } from '../application/ports/domain-synonym-discovery'
import { MAILBOX_PROBE } from '../application/ports/mailbox-probe'
import { VERIFICATION_TRACE_OBSERVER, VerificationTraceObserver } from '../application/verification-trace/verification-trace-observer'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { SyncEmailVerificationController } from './sync-email-verification.controller'
import { EmailAdministrationController } from '../api/http/email-administration/email-administration.controller'

@Module({
    imports: [
        VerificationTraceModule,
        TypeOrmModule.forFeature([EmailEntity, DomainPolicyEntity, EmailVerificationEntity]),
        EmailVerifierModule,
        DnsModule,
        HttpModule,
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
        {
            provide: MAILBOX_PROBE,
            inject: [SmtpVerifier],
            useFactory: (smtpVerifier: ISmtpVerifier) => new CompatibilityMailboxProbe(smtpVerifier),
        },
        {
            provide: MailboxVerificationService,
            inject: [MAILBOX_PROBE, CATCH_ALL_VERIFIERS_TOKEN],
            useFactory: (mailboxProbe: CompatibilityMailboxProbe, accountDiscoveryVerifiers: ICatchAllVerifier[]) =>
                new MailboxVerificationService(mailboxProbe, accountDiscoveryVerifiers),
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
