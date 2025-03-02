import type { IEmailVerificationService } from '../email-verification'
import type { FindLeadRequest, FindLeadResult } from './dto'
import { deprioritizedEmailFormats, getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './util'
import type { Logger } from '../logging'
import type { EmailPattern } from '../email/enums'

export class LeadFinder {
    constructor(
        private readonly emailVerificationService: IEmailVerificationService,
        private readonly logger: Logger,
    ) {}

    async findLead(lead: FindLeadRequest): Promise<FindLeadResult> {
        const { domain } = lead
        const findLeadResult: FindLeadResult = {
            ...lead,
            emails: [],
        }

        try {
            const emailPatternUsage = await this.emailVerificationService.aggregateEmailPatternUsageForDomain(domain)
            const allEmailFormats = getAllEmailFormats()
            const emailFormats = mergeEmailFormats(emailPatternUsage, allEmailFormats)
            const formatToEmailMapForLead = getFormatToEmailMapForLead(lead)

            for (const { pattern: format } of emailFormats) {
                const email = formatToEmailMapForLead.get(format)
                if (email == null) continue

                const shouldContinue = await this.processEmailFormat(email, format, findLeadResult)
                if (!shouldContinue) break
            }
        } catch (error) {
            this.logger.error(`Error in findLead: ${JSON.stringify(error)}`)
        }

        return findLeadResult
    }

    private async processEmailFormat(
        email: string,
        format: EmailPattern,
        findLeadResult: FindLeadResult,
    ): Promise<boolean> {
        const emailVerificationResult = await this.emailVerificationService.verify({
            email,
            format,
        })

        if (emailVerificationResult.exists === true) {
            findLeadResult.emails.push(emailVerificationResult)
        }

        return emailVerificationResult.exists !== true || deprioritizedEmailFormats.has(format)
    }
}
