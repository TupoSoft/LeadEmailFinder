import type { IEmailVerificationRunner } from './runner'
import type { EmailVerificationRepository } from './repository'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { EmailPatternUsage } from '../domain'
import type { EmailVerificationQueue } from './queue'
import type { EmailRepository } from '../email/repository'
import type { EmailPattern } from '../email/enums'

export interface IEmailVerificationService {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
    aggregateEmailPatternUsageForDomain: (domain: string) => Promise<EmailPatternUsage[]>
}

export class EmailVerificationService implements IEmailVerificationService {
    private static readonly INITIAL_COUNT = 0
    private static readonly COUNT_INCREMENT = 1

    constructor(
        private readonly emailVerificationRunner: IEmailVerificationRunner,
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly emailRepository: EmailRepository,
        private readonly emailVerificationQueue: EmailVerificationQueue,
    ) {}

    async verify({ email, format }: EmailVerificationRequest): Promise<EmailVerificationResult> {
        email = email.toLowerCase()
        const [username, domain] = email.split('@')

        const emailVerificationResult = await this.emailVerificationRunner.verify({ email, format })
        const emailVerificationRecord = await this.emailVerificationRepository.save(emailVerificationResult)
        const { exists, id: lastVerificationId } = emailVerificationRecord

        await this.emailRepository.findByIdOrCreate({
            email,
            format,
            exists,
            username,
            domain,
            lastVerificationId,
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
