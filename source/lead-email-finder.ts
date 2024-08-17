import { resolveMx } from 'node:dns/promises'
import { SMTPClient, SMTPClientError, SMTPResponseCode } from './smtp'
import { SMTPVerificationError } from './email-verifier'
import { generateRandomString } from './util'
import { generateEmails } from './email-format'
import rotator, { type ProxyRotator } from './proxy'

interface FindLeadData {
    lead: Lead
    matches: string[]
    catchAll: boolean
    error: SMTPVerificationError | null
}

export interface Lead {
    firstName: string
    lastName: string
    domain: string
}

export class LeadEmailFinder {
    constructor(private readonly proxyRotator: ProxyRotator = rotator) {}

    async findLead(lead: Lead): Promise<FindLeadData> {
        const data: FindLeadData = {
            lead,
            matches: [],
            error: null,
            catchAll: false,
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

            const emails = generateEmails(lead)

            code = await client.rcptTo(generateRandomString(5) + emails[0].address)
            if (code === SMTPResponseCode.OK) {
                data.error = SMTPVerificationError.CatchAll
                return data
            }

            for (const { address } of emails) {
                code = await client.rcptTo(address)
                if (code !== SMTPResponseCode.MailboxNotFound) {
                    data.matches.push(address)
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
