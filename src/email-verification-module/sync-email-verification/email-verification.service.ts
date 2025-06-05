import { Inject, Injectable } from '@nestjs/common'
import {
    IDomainService,
    IEmailService,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
    IEmailVerifier,
    VerifyOptions,
} from '../../common'
import { Model, Types } from 'mongoose'
import { EmailVerification } from './email-verification.schema'
import { InjectModel } from '@nestjs/mongoose'
import { DOMAIN_SERVICE_TOKEN, EMAIL_SERVICE_TOKEN, EMAIL_VERIFIER_TOKEN } from './email-verification.constants'
import { DomainVerificationForbiddenException } from './domain-verification-forbidden.exception'

@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
    constructor(
        @Inject(EMAIL_VERIFIER_TOKEN) private readonly emailVerifier: IEmailVerifier,
        @InjectModel(EmailVerification.name) private readonly emailVerificationModel: Model<EmailVerification>,
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

        const emailVerificationRecord = await this.emailVerificationModel.findOneAndUpdate(
            { _id: emailRecord.lastVerificationId ?? new Types.ObjectId() },
            { ...emailVerificationResult, batchId },
            { upsert: true, new: true },
        )

        await this.emailService.updateEmail(email, {
            exists: emailVerificationResult.exists,
            lastVerificationId: emailVerificationRecord._id.toHexString(),
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
