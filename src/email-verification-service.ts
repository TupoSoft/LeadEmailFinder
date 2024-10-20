import type { EmailVerificationRepository } from './repositories/email-verification-repository'
import type { Domain, EmailVerification } from './entities'
import { type SMTPClient, SMTPClientError, type SMTPClientFactory, SMTPSessionInitiationFailedError } from './smtp'
import type { CatchAllVerifier } from './catch-all'
import { getMxRecords, getSecondLevelDomainSplit } from './dns-util'
import { appendRandomPrefix } from './string-util'
import { DomainNotFoundError, type DomainRepository } from './repositories/domain-repository'

export class EmailVerificationService {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly catchAllVerifier: CatchAllVerifier,
        private readonly smtpClientFactory: SMTPClientFactory,
        private readonly domainRepository: DomainRepository,
    ) {}

    async verifyEmail(email: string): Promise<EmailVerification> {
        const [localPart, domainName] = email.split('@')

        const emailVerification: EmailVerification = {
            success: false,
            source: 'None',
            domain: domainName,
            localPart,
            email,
            verifiedAt: new Date(),
        }

        const client: SMTPClient = this.smtpClientFactory.getInstance()

        try {
            const domain = await this.domainRepository.findByName(domainName).catch(reason => {
                if (reason instanceof DomainNotFoundError) {
                    const newDomainData: Domain = {
                        name: domainName,
                        emailFormats: [],
                        createdAt: new Date(),
                    }

                    return newDomainData
                } else if (reason instanceof Error) {
                    throw reason
                } else {
                    throw new Error('Unexpected error while fetching the domain data: ' + reason)
                }
            })

            const mxRecords = domain.mxRecords ?? (await getMxRecords(emailVerification.domain))
            const mxRecord = await client.connect({ mxRecords })
            emailVerification.targetExchange = mxRecord.exchange
            emailVerification.mxDomain = getSecondLevelDomainSplit(mxRecord.exchange)

            await client.helo()
            await client.mailFrom()

            const catchAllEnabled =
                domain.catchAllEnabled ??
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

            await this.domainRepository.save({ ...domain, mxRecords, catchAllEnabled })
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

        emailVerification.verifiedAt = new Date()

        await this.emailVerificationRepository.save(emailVerification)

        return emailVerification
    }

    async verifyEmails(emails: string[]): Promise<EmailVerification[]> {
        return await Promise.all(emails.map(this.verifyEmail.bind(this)))
    }
}
