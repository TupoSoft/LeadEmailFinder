import type { FindLeadResult, Lead } from './dto'
import { getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './util'
import type { EmailVerificationService } from '../email-verification'
import type { DomainService } from '../domain'

export class FindLeadService {
    constructor(
        private readonly emailVerificationService: EmailVerificationService,
        private readonly domainService: DomainService,
    ) {}

    async findLead(lead: Lead): Promise<FindLeadResult> {
        const findLeadResult: FindLeadResult = {
            ...lead,
            emails: [],
        }

        const domain = await this.domainService.get(lead.domain)

        const formats = getFormatToEmailMapForLead(lead)

        const allEmailFormats = getAllEmailFormats()
        const emailFormats = mergeEmailFormats(domain.emailPatternUsage, allEmailFormats)

        for (const { pattern: format } of emailFormats) {
            const email = formats.get(format)
            if (email !== undefined) {
                const result = await this.emailVerificationService.verifyEmail({ email, format })

                if (result.exists) {
                    findLeadResult.emails.push(result)

                    if (format !== '{first}') {
                        return findLeadResult
                    }
                }
            }
        }

        return findLeadResult
    }

    async findLeads(leads: Lead[]): Promise<FindLeadResult[]> {
        return await Promise.all(leads.map(this.findLead.bind(this)))
    }
}
