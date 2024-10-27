import type { EmailVerificationRepository } from './email-verification-repository'
import type { Domain, EmailVerification, Lead } from './entities'
import { type SMTPClient, SMTPClientError, type SMTPClientFactory, SMTPSessionInitiationFailedError } from './smtp'
import type { CatchAllVerifier } from './catch-all'
import { getMxRecords, getSecondLevelDomainSplit } from './dns-util'
import { appendRandomPrefix } from './string-util'
import type { DomainRepository } from './domain-repository'
import { getAllEmailFormats, getFormatToEmailMapForLead, mergeEmailFormats } from './email-verification-util'

interface FindLeadResult extends Lead {
    emails: string[]
}

export class EmailVerificationService {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly catchAllVerifier: CatchAllVerifier,
        private readonly smtpClientFactory: SMTPClientFactory,
        private readonly domainRepository: DomainRepository,
    ) {}

    async verifyEmail(email: string): Promise<EmailVerification> {
        return await this.verifyEmailInternal({ email })
    }

    async verifyEmails(emails: string[]): Promise<EmailVerification[]> {
        return await Promise.all(emails.map(this.verifyEmail.bind(this)))
    }

    async findLead(lead: Lead): Promise<FindLeadResult> {
        const findLeadResult: FindLeadResult = {
            ...lead,
            emails: [],
        }

        const formats = getFormatToEmailMapForLead(lead)
        const domain = await this.getDomain(lead.domain)

        const allEmailFormats = getAllEmailFormats()
        const emailFormats = mergeEmailFormats(domain.emailFormats, allEmailFormats)

        for (const { name: format } of emailFormats) {
            const email = formats[format]
            const result = await this.verifyEmailInternal({ email, format, domain })

            if (result.success) {
                findLeadResult.emails.push(result.email)

                if (format !== '{first}') {
                    return findLeadResult
                }
            }
        }

        return findLeadResult
    }

    private async verifyEmailInternal(input: {
        email: string
        format?: string
        domain?: Domain
    }): Promise<EmailVerification> {
        const { email, format, domain } = input
        const [localPart, domainName] = email.split('@')

        const emailVerification: EmailVerification = {
            success: false,
            source: 'None',
            domain: domainName,
            localPart,
            email,
        }

        const previouslyVerified = await this.emailVerificationRepository.findByEmail(email).then(
            _ => true,
            _ => false,
        )

        const client: SMTPClient = this.smtpClientFactory.getInstance()

        try {
            const domainData = domain ?? (await this.getDomain(domainName))

            const mxRecords = domainData.mxRecords ?? (await getMxRecords(emailVerification.domain))
            const mxRecord = await client.connect({ mxRecords })
            emailVerification.targetExchange = mxRecord.exchange
            emailVerification.mxDomain = getSecondLevelDomainSplit(mxRecord.exchange)

            await client.helo()
            await client.mailFrom()

            const catchAllEnabled =
                domainData.catchAllEnabled ??
                (await client.rcptTo(appendRandomPrefix(email)).then(
                    _ => true,
                    _ => false,
                ))

            if (!catchAllEnabled) {
                emailVerification.success = await client.rcptTo(email).then(
                    _ => true,
                    _ => false,
                )

                emailVerification.source = 'SMTP'
            }

            await this.domainRepository.save({ ...domainData, mxRecords, catchAllEnabled })
            await client.quit()
        } catch (error) {
            if (error instanceof SMTPClientError) {
                if (error instanceof SMTPSessionInitiationFailedError) {
                    const [mxRecord] = error.mxRecords
                    emailVerification.targetExchange = mxRecord.exchange
                }

                emailVerification.error = error.name
            }
        }

        if (!emailVerification.success && emailVerification.source === 'None') {
            await this.catchAllVerifier
                .tryAll(email)
                .then(({ success, source }) => {
                    emailVerification.source = source
                    emailVerification.success = success
                })
                .catch(reason => {
                    console.error(reason)
                })
        }

        if (emailVerification.success && format !== undefined && !previouslyVerified) {
            await this.domainRepository.incrementEmailFormat(domainName, format)
        }
        await this.emailVerificationRepository.save(emailVerification)

        return emailVerification
    }

    private async getDomain(name: string): Promise<Domain> {
        return await this.domainRepository.findByName(name).catch(_ => {
            const domain: Domain = {
                createdAt: new Date(),
                emailFormats: [],
                name,
            }

            return domain
        })
    }
}
