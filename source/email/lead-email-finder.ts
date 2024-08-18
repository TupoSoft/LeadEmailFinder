import { resolveMx } from 'node:dns/promises'
import { SMTPClient, SMTPClientError, SMTPResponseCode } from '../smtp'
import { SMTPVerificationError } from './email-verifier'
import { generateRandomString } from '../util'
import { EmailFormatManager, generateEmails } from './email-format'
import type { ProxyRotator } from '../proxy'
import { CatchAllStatus } from './enums'

interface FindLeadData {
    lead: Lead
    matches: string[]
    catchAll: CatchAllStatus
    error: SMTPVerificationError | null
}

export interface Lead {
    firstName?: string
    lastName?: string
    domain: string
}

export class LeadEmailFinder {
    constructor(
        private readonly proxyRotator: ProxyRotator,
        private readonly emailFormatManager: EmailFormatManager,
    ) {}

    async findLead(lead: Lead): Promise<FindLeadData> {
        const data: FindLeadData = {
            lead,
            matches: [],
            error: null,
            catchAll: CatchAllStatus.Unknown,
        }

        const mxRecords = await resolveMx(lead.domain)
        if (mxRecords.length < 0) {
            data.error = SMTPVerificationError.NoMxRecords
            return data
        }

        const client = new SMTPClient()
        const nextProxy = this.proxyRotator.getRandomProxy()

        try {
            await client.connect({
                mxRecords,
                proxy: nextProxy,
            })
            await client.helo()

            let code = await client.mailFrom()
            if (code !== SMTPResponseCode.OK) {
                data.error = SMTPVerificationError.SenderIdentificationFailed
                return data
            }

            const prioritizedEmailFormats = await this.emailFormatManager.getSet(lead.domain)
            const emails = generateEmails(lead)

            code = await client.rcptTo(generateRandomString(5) + emails[0])
            if (code === SMTPResponseCode.OK) {
                data.catchAll = CatchAllStatus.Enabled
                return data
            }

            for (const formatType of prioritizedEmailFormats) {
                const email = emails[formatType]
                code = await client.rcptTo(email)
                if (code !== SMTPResponseCode.MailboxNotFound) {
                    await this.emailFormatManager.incrementScore(email, formatType)
                    data.matches.push(email)

                    if (!EmailFormatManager.isDeprioritized(formatType)) {
                        break
                    }
                }
            }
        } catch (error: unknown) {
            if (error instanceof SMTPClientError) {
                data.error = error.code
            } else if (error instanceof Error) {
                throw error
            }
        } finally {
            await client.quit()
        }

        return data
    }
}
