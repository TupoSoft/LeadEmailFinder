import type { EmailVerificationRepository } from './repository'
import type { SMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { ICatchAllVerifier } from './catch-all-verifier'

export class EmailVerificationService {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly catchAllVerifier: ICatchAllVerifier,
        private readonly smtpVerifier: SMTPVerifier,
    ) {}

    async verifyEmail(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResult> {
        const { email, format } = emailVerificationRequest
        const [localPart, domainName] = email.split('@')

        const emailVerification: EmailVerificationResult = {
            exists: false,
            sources: [],
            domain: domainName,
            localPart,
            email,
            format,
        }

        const { exists, catchAllStatus, targetExchange, mxDomain } = await this.smtpVerifier.verify(email)
        if (catchAllStatus !== undefined && !catchAllStatus && exists !== undefined) {
            emailVerification.exists = exists
            emailVerification.targetExchange = targetExchange
            emailVerification.mxDomain = mxDomain
            emailVerification.sources.push('SMTP')
        } else {
            await this.catchAllVerifier
                .tryAll(email)
                .then(({ success, source }) => {
                    emailVerification.sources.push(source)
                    emailVerification.exists = success
                })
                .catch(reason => {
                    console.error(reason)
                })
        }

        await this.emailVerificationRepository.save(emailVerification)

        return emailVerification
    }

    async verifyEmails(emailVerificationRequests: EmailVerificationRequest[]): Promise<EmailVerificationResult[]> {
        return await Promise.all(emailVerificationRequests.map(this.verifyEmail.bind(this)))
    }
}
