import type { EmailVerificationRepository } from './repository'
import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { ICatchAllVerifier } from './catch-all-verifier'

export interface VerifyOptions {
    abortSignal?: AbortSignal
    throwIfNonexistent?: boolean
}

export class EmailVerificationService {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly catchAllVerifier: ICatchAllVerifier,
        private readonly smtpVerifier: ISMTPVerifier,
    ) {}

    async verifyEmail(
        emailVerificationRequest: EmailVerificationRequest,
        opts?: VerifyOptions,
    ): Promise<EmailVerificationResult> {
        const { email, format } = emailVerificationRequest
        const { abortSignal, throwIfNonexistent } = opts ?? {}

        const [localPart, domain] = email.split('@')

        const emailVerification: EmailVerificationResult = {
            exists: false,
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        try {
            const { exists, catchAllStatus, targetExchange, mxDomain } = await this.smtpVerifier.verify({
                email,
                abortSignal,
            })

            if (catchAllStatus !== undefined && !catchAllStatus && exists !== undefined) {
                emailVerification.exists = exists
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = mxDomain
                emailVerification.sources.push('SMTP')
            } else {
                const { source, success } = await this.catchAllVerifier.tryAll(email)
                emailVerification.sources.push(source)
                emailVerification.exists = success
            }

            await this.emailVerificationRepository.save(emailVerification)
        } catch (error) {
            console.error(error)
        }

        if (throwIfNonexistent && !emailVerification.exists) {
            throw new Error(`The email ${email} doesn't exist`)
        }

        return emailVerification
    }

    async verifyEmails(emailVerificationRequests: EmailVerificationRequest[]): Promise<EmailVerificationResult[]> {
        return await Promise.all(emailVerificationRequests.map(async request => await this.verifyEmail(request)))
    }
}
