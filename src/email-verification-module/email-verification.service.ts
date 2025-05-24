import { Injectable } from '@nestjs/common'
import {
    IDomainResponseDto,
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
import { DomainVerificationForbiddenException } from './exceptions'

@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
    private static readonly VERIFICATION_SHELF_LIFE = parseTimeString('1d')

    constructor(
        private readonly emailVerifier: IEmailVerifier,
        private readonly emailVerificationModel: Model<EmailVerification>,
        private readonly emailService: IEmailService,
        private readonly domainService: IDomainService,
    ) {}

    private static validateDomain(domain: IDomainResponseDto | null): void {
        if (domain === null) return

        if (domain.isVerificationForbidden) {
            throw new DomainVerificationForbiddenException(domain.name)
        }
    }

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

        const [, domain] = email.split('@')

        const domainData = await this.domainService.getDomain(domain)
        EmailVerificationService.validateDomain(domainData)

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
}
