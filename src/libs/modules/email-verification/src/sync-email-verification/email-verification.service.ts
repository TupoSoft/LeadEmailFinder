import { Inject, Injectable } from '@nestjs/common'
import {
    IDomainService,
    IEmailService,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
    IEmailVerifier,
    VerifyOptions,
} from '@tuposoft/lead-email-finder/common'
import { EmailVerification } from './email-verification.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DOMAIN_SERVICE_TOKEN, EMAIL_SERVICE_TOKEN, EMAIL_VERIFIER_TOKEN } from './email-verification.constants'
import { DomainVerificationForbiddenException } from './domain-verification-forbidden.exception'

@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
    constructor(
        @Inject(EMAIL_VERIFIER_TOKEN) private readonly emailVerifier: IEmailVerifier,
        @InjectRepository(EmailVerification) private readonly emailVerificationRepo: Repository<EmailVerification>,
        @Inject(EMAIL_SERVICE_TOKEN) private readonly emailService: IEmailService,
        @Inject(DOMAIN_SERVICE_TOKEN) private readonly domainService: IDomainService,
    ) {}

    async verify({ organizationId, email, format, batchId }: VerifyOptions): Promise<IEmailVerificationResponseDto> {
        email = email.toLowerCase()

        const [, domainName] = email.split('@')

        await this.validateDomain(domainName)

        await this.emailService.upsertEmail(organizationId, email, {
            format,
            exists: null,
        })

        const emailVerificationResult = await this.emailVerifier.verify({ organizationId, email, format })

        let emailVerificationRecord = this.emailVerificationRepo.create({ organizationId })
        Object.assign(emailVerificationRecord, { ...emailVerificationResult, batchId, organizationId })
        emailVerificationRecord = await this.emailVerificationRepo.save(emailVerificationRecord)

        await this.emailService.upsertEmail(organizationId, email, {
            exists: emailVerificationResult.exists,
            lastVerificationId: emailVerificationRecord.id,
        })

        return EmailVerificationService.withoutOrganization(emailVerificationRecord)
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
