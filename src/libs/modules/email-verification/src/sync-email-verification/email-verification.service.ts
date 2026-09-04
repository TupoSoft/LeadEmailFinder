import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import {
    IDomainService,
    IEmailService,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
    IEmailVerifier,
    VerifyOptions,
    safeErrorType,
} from '@tuposoft/lead-email-finder/common'
import { EmailVerification } from './email-verification.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DOMAIN_SERVICE_TOKEN, EMAIL_SERVICE_TOKEN, EMAIL_VERIFIER_TOKEN } from './email-verification.constants'
import { DomainVerificationForbiddenException } from './domain-verification-forbidden.exception'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    observeSafely,
    VERIFICATION_TRACE_OBSERVER,
    VerificationFailureStage,
    VerificationTraceObserver,
} from '../application/verification-trace/verification-trace-observer'

@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
    constructor(
        @Inject(EMAIL_VERIFIER_TOKEN) private readonly emailVerifier: IEmailVerifier,
        @InjectRepository(EmailVerification) private readonly emailVerificationRepo: Repository<EmailVerification>,
        @Inject(EMAIL_SERVICE_TOKEN) private readonly emailService: IEmailService,
        @Inject(DOMAIN_SERVICE_TOKEN) private readonly domainService: IDomainService,
        @Inject(VERIFICATION_TRACE_OBSERVER)
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
    ) {}

    async verify({
        organizationId,
        email,
        format,
        batchId,
        trace,
    }: VerifyOptions): Promise<IEmailVerificationResponseDto> {
        const context = trace ?? { operationId: randomUUID(), mode: 'sync' as const }
        const startedAt = performance.now()
        let stage: VerificationFailureStage = 'domain_policy'

        try {
            email = email.toLowerCase()
            const [, domainName] = email.split('@')
            await this.validateDomain(domainName)

            stage = 'email_cache_prepare'
            await this.emailService.upsertEmail(organizationId, email, { format, exists: null })

            stage = 'verification_probe'
            const emailVerificationResult = await this.emailVerifier.verify({ organizationId, email, format })

            stage = 'verification_persist'
            let emailVerificationRecord = this.emailVerificationRepo.create({ organizationId })
            Object.assign(emailVerificationRecord, { ...emailVerificationResult, batchId, organizationId })
            emailVerificationRecord = await this.emailVerificationRepo.save(emailVerificationRecord)

            stage = 'email_cache_finalize'
            await this.emailService.upsertEmail(organizationId, email, {
                exists: emailVerificationResult.exists,
                lastVerificationId: emailVerificationRecord.id,
            })

            observeSafely(() =>
                this.traceObserver.completed({
                    ...context,
                    verificationId: emailVerificationRecord.id,
                    reason: emailVerificationRecord.reason,
                    durationMs: performance.now() - startedAt,
                }),
            )
            return EmailVerificationService.withoutOrganization(emailVerificationRecord)
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
        const isAllowed = await this.domainService.isVerificationAllowed(domainName)

        if (!isAllowed) {
            throw new DomainVerificationForbiddenException(domainName)
        }
    }

    private static withoutOrganization({
        organizationId: _organizationId,
        ...response
    }: EmailVerification): IEmailVerificationResponseDto {
        return response
    }
}
