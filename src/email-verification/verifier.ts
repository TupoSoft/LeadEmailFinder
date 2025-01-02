import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { Logger } from '../logging'
import { isNativeError } from 'node:util/types'
import { ok } from 'node:assert'
import type { SMTPVerificationResult } from '../smtp/dto'
import type { ICatchAllVerifier } from './catch-all-verifier'

export interface IEmailVerifier {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerifier implements IEmailVerifier {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly catchAllVerifier: ICatchAllVerifier,
        private readonly logger: Logger,
    ) {}

    private static isSuccessful(smtpVerificationResult: SMTPVerificationResult): boolean {
        const { catchAllStatus, exists } = smtpVerificationResult
        return catchAllStatus !== undefined && !catchAllStatus && exists !== undefined
    }

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
            const smtpVerificationResult = await this.smtpVerifier.verify({
                email,
            })

            if (EmailVerifier.isSuccessful(smtpVerificationResult)) {
                const { exists, targetExchange, mxDomain } = smtpVerificationResult

                ok(exists !== undefined, 'exists cannot be undefined when the SMTP verification is successful')

                emailVerification.exists = exists
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = mxDomain
                emailVerification.sources.push('SMTP')
            } else {
                const { source, success } = await this.catchAllVerifier.tryAll(email)
                emailVerification.sources.push(source)
                emailVerification.exists = success
            }
        } catch (error) {
            ok(isNativeError(error), 'Malformed error in SmtpEmailVerifier.verify')
            this.logger.error(`Error in SmtpEmailVerifier.verify: ${error.message}`)
        }

        return emailVerification
    }
}
