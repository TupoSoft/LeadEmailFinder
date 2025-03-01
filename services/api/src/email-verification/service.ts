import type { IEmailVerificationRunner } from './runner'
import type { EmailVerificationRepository } from './repository'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { EmailPatternUsage } from '../domain'
import type { EmailRecord, EmailRepository } from '../email/repository'
import type { EmailPattern } from '../email/enums'
import { parseTimeString } from '../util/time'

export interface IEmailVerificationService {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
    aggregateEmailPatternUsageForDomain: (domain: string) => Promise<EmailPatternUsage[]>
}

export class EmailVerificationService implements IEmailVerificationService {
    private static readonly VERIFICATION_SHELF_LIFE = parseTimeString('1d')
    private static readonly INITIAL_COUNT = 0
    private static readonly COUNT_INCREMENT = 1

    constructor(
        private readonly emailVerificationRunner: IEmailVerificationRunner,
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly emailRepository: EmailRepository,
    ) {}

    private static hasRecentVerification(
        lastVerificationData: Pick<EmailRecord, 'lastVerificationId' | 'lastVerifiedAt'>,
    ): lastVerificationData is Required<Pick<EmailRecord, 'lastVerificationId' | 'lastVerifiedAt'>> {
        const { lastVerifiedAt, lastVerificationId } = lastVerificationData
        return (
            lastVerifiedAt !== undefined &&
            lastVerificationId !== undefined &&
            Date.now() - lastVerifiedAt.getTime() < EmailVerificationService.VERIFICATION_SHELF_LIFE
        )
    }

    async verify({ email, format }: EmailVerificationRequest): Promise<EmailVerificationResult> {
        email = email.toLowerCase()

        const [username, domain] = email.split('@')

        const emailRecord = await this.emailRepository.findByIdOrCreate({
            email,
            format,
            exists: null,
            username,
            domain,
        })

        const hasRecentVerification = EmailVerificationService.hasRecentVerification(emailRecord)
        if (hasRecentVerification) {
            const previousVerification = await this.emailVerificationRepository.findById(emailRecord.lastVerificationId)
            if (previousVerification?.exists != null) {
                return previousVerification
            }
        }

        const emailVerificationResult = await this.emailVerificationRunner.verify({ email, format })

        if (hasRecentVerification) {
            const { lastVerificationId } = emailRecord
            emailVerificationResult.id = lastVerificationId
        }

        const emailVerificationRecord = await this.emailVerificationRepository.upsert(emailVerificationResult)

        await this.emailRepository.update(email, {
            exists: emailVerificationResult.exists,
            lastVerificationId: emailVerificationRecord.id,
        })

        return emailVerificationRecord
    }

    async aggregateEmailPatternUsageForDomain(domain: string): Promise<EmailPatternUsage[]> {
        const emailRecords = await this.emailRepository.findAll({ domain, exists: true, formatExists: true })

        const patternUsageMap = emailRecords.reduce<Map<EmailPattern, number>>((acc, record) => {
            if (record.format !== undefined) {
                const count = acc.get(record.format) ?? EmailVerificationService.INITIAL_COUNT
                acc.set(record.format, count + EmailVerificationService.COUNT_INCREMENT)
            }

            return acc
        }, new Map())

        return Array.from(patternUsageMap.entries())
            .map(([pattern, usageCount]) => ({
                pattern,
                usageCount,
            }))
            .sort((a, b) => b.usageCount - a.usageCount)
    }
}
