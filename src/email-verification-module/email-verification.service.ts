import { Inject, Injectable } from '@nestjs/common'
import {
    IDomainService,
    IEmailResponseDto,
    IEmailService,
    IEmailVerificationRequestDto,
    IEmailVerificationResultDto,
    IEmailVerificationService,
    IEmailVerifier,
    parseTimeString,
} from '../common'
import { Model } from 'mongoose'
import { EmailVerification } from './email-verification.schema'
import { InjectModel } from '@nestjs/mongoose'
import { DOMAIN_SERVICE_TOKEN, EMAIL_SERVICE_TOKEN, EMAIL_VERIFIER_TOKEN } from './email-verification.constants'
import { DomainVerificationForbiddenException } from './domain-verification-forbidden.exception'

@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
    private static readonly VERIFICATION_SHELF_LIFE = parseTimeString('1d')

    constructor(
        @Inject(EMAIL_VERIFIER_TOKEN) private readonly emailVerifier: IEmailVerifier,
        @InjectModel(EmailVerification.name) private readonly emailVerificationModel: Model<EmailVerification>,
        @Inject(EMAIL_SERVICE_TOKEN) private readonly emailService: IEmailService,
        @Inject(DOMAIN_SERVICE_TOKEN) private readonly domainService: IDomainService,
    ) {}

    private static hasRecentVerification(
        lastVerificationData: Pick<IEmailResponseDto, 'lastVerificationId' | 'lastVerifiedAt'>,
    ): lastVerificationData is Required<Pick<IEmailResponseDto, 'lastVerificationId' | 'lastVerifiedAt'>> {
        const { lastVerifiedAt, lastVerificationId } = lastVerificationData
        return (
            lastVerifiedAt !== undefined &&
            lastVerificationId !== undefined &&
            Date.now() - lastVerifiedAt.getTime() < EmailVerificationService.VERIFICATION_SHELF_LIFE
        )
    }

    async verify({ email, format }: IEmailVerificationRequestDto): Promise<IEmailVerificationResultDto> {
        email = email.toLowerCase()

        const [, domainName] = email.split('@')

        await this.validateDomain(domainName)

        const emailRecord = await this.emailService.updateEmail(email, {
            format,
            exists: null,
        })

        const hasRecentVerification = EmailVerificationService.hasRecentVerification(emailRecord)

        if (hasRecentVerification) {
            const previousVerification = await this.emailVerificationModel.findById(emailRecord.lastVerificationId)
            if (previousVerification?.exists != null) {
                return previousVerification
            }
        }

        const emailVerificationResult = await this.emailVerifier.verify({ email, format })

        const emailVerificationRecord = await this.emailVerificationModel.findOneAndUpdate(
            { _id: emailRecord.lastVerificationId },
            emailVerificationResult,
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
