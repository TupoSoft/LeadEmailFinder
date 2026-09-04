import { randomUUID } from 'node:crypto'
import { VerifyOptions, safeErrorType } from '@tuposoft/lead-email-finder/common'
import { EmailVerification, OwnedEmailVerification } from '../domain/email-verification'
import { DomainVerificationForbiddenError } from '../domain/errors'
import { DomainPolicyService } from './domain-policy.service'
import { EmailAdministrationService } from './email-administration.service'
import { MailboxVerificationService } from './mailbox-verification.service'
import { VerificationStore } from './ports/verification-store'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    VerificationFailureStage,
    VerificationTraceObserver,
    observeSafely,
} from './verification-trace/verification-trace-observer'

export class EmailVerificationOrchestrator {
    constructor(
        private readonly mailboxVerification: MailboxVerificationService,
        private readonly verificationStore: VerificationStore,
        private readonly emailAdministration: EmailAdministrationService,
        private readonly domainPolicy: DomainPolicyService,
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
    ) {}

    async verify({ organizationId, email, format, batchId, trace }: VerifyOptions): Promise<OwnedEmailVerification> {
        const context = trace ?? { operationId: randomUUID(), mode: 'sync' as const }
        const startedAt = performance.now()
        let stage: VerificationFailureStage = 'domain_policy'

        try {
            email = email.toLowerCase()
            const [, domainName] = email.split('@')
            await this.validateDomain(domainName)

            stage = 'email_cache_prepare'
            await this.emailAdministration.upsertEmail(organizationId, email, { format, exists: null })

            stage = 'verification_probe'
            const probeResult = await this.mailboxVerification.verify(organizationId, email, format)

            stage = 'verification_persist'
            const record = await this.verificationStore.create(organizationId, { ...probeResult, batchId })

            stage = 'email_cache_finalize'
            await this.emailAdministration.upsertEmail(organizationId, email, {
                exists: record.exists,
                lastVerificationId: record.id,
            })

            observeSafely(() =>
                this.traceObserver.completed({
                    ...context,
                    verificationId: record.id,
                    reason: record.reason,
                    durationMs: performance.now() - startedAt,
                }),
            )
            return EmailVerificationOrchestrator.withoutOrganization(record)
        } catch (error) {
            observeSafely(() =>
                this.traceObserver.failed({
                    ...context,
                    stage,
                    errorType: safeErrorType(error),
                    durationMs: performance.now() - startedAt,
                }),
            )
            throw error
        }
    }

    private async validateDomain(domainName: string): Promise<void> {
        const isAllowed = await this.domainPolicy.isVerificationAllowed(domainName)

        if (!isAllowed) {
            throw new DomainVerificationForbiddenError(domainName)
        }
    }

    private static withoutOrganization({
        organizationId: _organizationId,
        ...response
    }: EmailVerification): OwnedEmailVerification {
        return response
    }
}
