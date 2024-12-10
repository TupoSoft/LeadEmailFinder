import type { FindLeadResult, Lead } from './dto'
import { getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './util'
import type { EmailVerificationResult, EmailVerificationService } from '../email-verification'
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

        try {
            // const domain = await this.domainService.get(lead.domain)

            const formats = getFormatToEmailMapForLead(lead)

            const allEmailFormats = getAllEmailFormats()
            const emailFormats = mergeEmailFormats([], allEmailFormats)

            const abortController = new AbortController()
            const { signal } = abortController
            const verifications: Array<Promise<EmailVerificationResult>> = []
            for (const { pattern: format } of emailFormats) {
                const email = formats.get(format)
                if (email !== undefined) {
                    verifications.push(
                        this.emailVerificationService.verifyEmail(
                            {
                                email,
                                format,
                            },
                            { throwIfNonexistent: true, abortSignal: signal },
                        ),
                    )
                }
            }

            const firstPositiveVerificationResult = await Promise.any(verifications)

            abortController.abort()

            findLeadResult.emails.push(firstPositiveVerificationResult)

            const settledVerificationPromises = await Promise.allSettled(verifications)
            for (const settledVerificationPromise of settledVerificationPromises) {
                if (settledVerificationPromise.status === 'fulfilled') {
                    findLeadResult.emails.push(settledVerificationPromise.value)
                }
            }
        } catch (error) {
            console.error('Error in findLead: ', error)
        }

        return findLeadResult
    }

    async findLeads(leads: Lead[]): Promise<FindLeadResult[]> {
        return await Promise.all(leads.map(this.findLead.bind(this)))
    }
}
