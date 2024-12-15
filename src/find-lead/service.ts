import type { FindLeadResult, Lead } from './dto'
import { deprioritizedEmailFormats, getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './util'
import type { EmailVerificationResult, EmailVerificationService } from '../email-verification'

export class FindLeadService {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

    async findLead(lead: Lead): Promise<FindLeadResult> {
        const findLeadResult: FindLeadResult = {
            ...lead,
            emails: [],
        }

        try {
            const formats = getFormatToEmailMapForLead(lead)

            const allEmailFormats = getAllEmailFormats()
            const emailFormats = mergeEmailFormats([], allEmailFormats)

            const verificationResultPromises: Array<Promise<EmailVerificationResult>> = []
            for (const { pattern: format } of emailFormats) {
                const email = formats.get(format)
                if (email !== undefined) {
                    verificationResultPromises.push(
                        this.emailVerificationService.verifyEmail(
                            {
                                email,
                                format,
                            },
                            { throwIfNonexistent: true },
                        ),
                    )
                }
            }

            const firstPositiveVerificationResult = await Promise.any(verificationResultPromises)
            findLeadResult.emails.push(firstPositiveVerificationResult)

            const { format } = firstPositiveVerificationResult

            const settleVerificationPromises = async (): Promise<void> => {
                const settledVerificationPromises = await Promise.allSettled(verificationResultPromises)
                for (const settledVerificationPromise of settledVerificationPromises) {
                    if (settledVerificationPromise.status === 'fulfilled') {
                        findLeadResult.emails.push(settledVerificationPromise.value)
                    }
                }
            }

            if (format !== undefined && !deprioritizedEmailFormats.has(format)) {
                void settleVerificationPromises()

                return findLeadResult
            } else {
                await settleVerificationPromises()
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
