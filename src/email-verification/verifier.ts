import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { Logger } from '../logging'
import { isNativeError } from 'node:util/types'
import { ok } from 'node:assert'

export interface EmailVerifier {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class SmtpEmailVerifier implements EmailVerifier {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly logger: Logger,
    ) {}

    async verify(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResult> {
        const { email, format } = emailVerificationRequest
        const [localPart, domain] = email.split('@')

        const emailVerification: EmailVerificationResult = {
            exists: null,
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        try {
            const { exists, catchAllStatus, targetExchange, mxDomain } = await this.smtpVerifier.verify({
                email,
            })

            if (catchAllStatus !== undefined && !catchAllStatus && exists !== undefined) {
                emailVerification.exists = exists
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = mxDomain
                emailVerification.sources.push('SMTP')
            }
        } catch (error) {
            ok(isNativeError(error), 'Malformed error in SmtpEmailVerifier.verify')
            this.logger.error(`Error in SmtpEmailVerifier.verify: ${error.message}`)
        }

        return emailVerification
    }
}
