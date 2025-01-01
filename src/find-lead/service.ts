import type { FindLeadResult, Lead } from './dto'
import { deprioritizedEmailFormats, getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './util'
import type { EmailVerificationResult, EmailVerificationService } from '../email-verification'
import type { Logger } from '../logging'
import { NO_USAGES } from './constants'
import { ok } from 'node:assert'
import { isEmptyArray } from '../common/type-guards'
import type { EmailPatternUsage } from '../domain'

export class FindLeadService {
    constructor(
        private readonly emailVerificationService: EmailVerificationService,
        private readonly logger: Logger,
    ) {}

    async findLead(lead: Lead): Promise<FindLeadResult> {
        const { domain } = lead
        const findLeadResult: FindLeadResult = {
            ...lead,
            emails: [],
        }

        try {
            const emailPatternUsage = await this.emailVerificationService.aggregateEmailPatternUsageForDomain(domain)
            const allEmailFormats = getAllEmailFormats()
            const emailFormats = mergeEmailFormats(emailPatternUsage, allEmailFormats)
            const p0 = emailFormats.filter(
                ({ pattern, usageCount }) => usageCount > NO_USAGES && !deprioritizedEmailFormats.has(pattern),
            )
            const p1 = emailFormats.filter(({ pattern }) => !deprioritizedEmailFormats.has(pattern))
            const p2 = emailFormats.filter(({ pattern }) => deprioritizedEmailFormats.has(pattern))

            try {
                const emailVerificationResult = await this.findEmailForFormats(lead, p0)
                findLeadResult.emails.push(emailVerificationResult)
                return findLeadResult
            } catch (error) {
                this.logger.error(`No high priority emails found for lead: ${JSON.stringify(lead)}`)
            }

            try {
                const emailVerificationResult = await this.findEmailForFormats(lead, p1)
                findLeadResult.emails.push(emailVerificationResult)
                return findLeadResult
            } catch (error) {
                this.logger.error(`No medium priority emails found for lead: ${JSON.stringify(lead)}`)
            }

            try {
                const emailVerificationResult = await this.findEmailForFormats(lead, p2)
                findLeadResult.emails.push(emailVerificationResult)
                return findLeadResult
            } catch (error) {
                this.logger.error(`No low priority emails found for lead: ${JSON.stringify(lead)}`)
            }
        } catch (error) {
            this.logger.error(`Error in findLead: ${JSON.stringify(error)}`)
        }

        return findLeadResult
    }

    async findLeads(leads: Lead[]): Promise<FindLeadResult[]> {
        return await Promise.all(leads.map(this.findLead.bind(this)))
    }

    private async findEmailForFormats(lead: Lead, formatUsages: EmailPatternUsage[]): Promise<EmailVerificationResult> {
        const verificationResultPromises = this.getVerificationResultPromises(lead, formatUsages)
        ok(!isEmptyArray(verificationResultPromises))

        const firstPositiveVerificationResult = await Promise.any(verificationResultPromises)

        void Promise.allSettled(verificationResultPromises)

        return firstPositiveVerificationResult
    }

    private getVerificationResultPromises(
        lead: Lead,
        emailPatternUsages: EmailPatternUsage[],
    ): Array<Promise<EmailVerificationResult>> {
        const formats = getFormatToEmailMapForLead(lead)

        const verificationResultPromises: Array<Promise<EmailVerificationResult>> = []

        for (const { pattern: format } of emailPatternUsages) {
            const email = formats.get(format)
            if (email !== undefined) {
                verificationResultPromises.push(
                    this.emailVerificationService.verify({
                        email,
                        format,
                    }),
                )
            }
        }

        return verificationResultPromises
    }
}
