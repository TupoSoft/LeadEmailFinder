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

    async verify({ email, format, batchId }: VerifyOptions): Promise<IEmailVerificationResponseDto> {
        email = email.toLowerCase()

        const [, domainName] = email.split('@')

        await this.validateDomain(domainName)

        const emailRecord = await this.emailService.updateEmail(email, {
            format,
            exists: null,
        })

        const emailVerificationResult = await this.emailVerifier.verify({ email, format })

        let emailVerificationRecord =
            emailRecord.lastVerificationId != null
                ? await this.emailVerificationRepo.findOneBy({ id: emailRecord.lastVerificationId })
                : null

        emailVerificationRecord ??= this.emailVerificationRepo.create()
        Object.assign(emailVerificationRecord, { ...emailVerificationResult, batchId })
        emailVerificationRecord = await this.emailVerificationRepo.save(emailVerificationRecord)

        await this.emailService.updateEmail(email, {
            exists: emailVerificationResult.exists,
            lastVerificationId: emailVerificationRecord.id,
        })

        return emailVerificationRecord
    }

    private async validateDomain(domainName: string): Promise<void> {
        const isAllowed = await this.domainService.isVerificationAllowed(domainName)

        if (!isAllowed) {
            throw new DomainVerificationForbiddenException(domainName)
        }
    }
}
