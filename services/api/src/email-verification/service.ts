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

type LastVerificationData = Pick<EmailRecord, 'lastVerificationId' | 'lastVerifiedAt' | 'exists'>

export class EmailVerificationService implements IEmailVerificationService {
    private static readonly VERIFICATION_SHELF_LIFE = parseTimeString('1d')
    private static readonly INITIAL_COUNT = 0
    private static readonly COUNT_INCREMENT = 1

    constructor(
        private readonly emailVerificationRunner: IEmailVerificationRunner,
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly emailRepository: EmailRepository,
    ) {}

    private static isPreviouslyVerified(
        lastVerificationData: LastVerificationData,
    ): lastVerificationData is Required<LastVerificationData> {
        const { lastVerifiedAt, lastVerificationId, exists } = lastVerificationData
        return lastVerifiedAt !== undefined && lastVerificationId !== undefined && exists !== null
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

        if (EmailVerificationService.isPreviouslyVerified(emailRecord)) {
            const previousVerification = await this.getPreviousFreshVerificationIfFound(emailRecord)
            if (previousVerification != null) {
                return previousVerification
            }
        }

        const emailVerificationResult = await this.emailVerificationRunner.verify({ email, format })

        const emailVerificationRecord = await this.emailVerificationRepository.save(emailVerificationResult)
        const { exists, id: verificationId } = emailVerificationRecord

        await this.emailRepository.update(email, {
            exists,
            lastVerificationId: verificationId,
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

    private async getPreviousFreshVerificationIfFound({
        lastVerificationId,
        lastVerifiedAt,
    }: Required<Pick<EmailRecord, 'lastVerificationId' | 'lastVerifiedAt'>>): Promise<EmailVerificationResult | null> {
        const now = Date.now()
        const timeDiff = now - lastVerifiedAt.getTime()

        if (timeDiff < EmailVerificationService.VERIFICATION_SHELF_LIFE) {
            return await this.emailVerificationRepository.findById(lastVerificationId)
        }

        return null
    }
}
