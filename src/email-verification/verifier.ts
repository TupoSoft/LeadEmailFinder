import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { Logger } from '../logging'
import { isNativeError } from 'node:util/types'
import { ok } from 'node:assert'
import type { SMTPVerificationResult } from '../smtp/dto'
import type { CatchAllVerificationResult, ICatchAllVerifier } from './catch-all-verifier'

export interface IEmailVerifier {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerifier implements IEmailVerifier {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly catchAllVerifier: ICatchAllVerifier,
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

        const { exists, targetExchange, mxDomain } = await this.verifyViaSmtp(email)
        if (exists === true) {
            emailVerification.exists = exists
            emailVerification.targetExchange = targetExchange
            emailVerification.mxDomain = mxDomain
            emailVerification.sources.push('SMTP')
            return emailVerification
        }

        const { source, success } = await this.verifyViaHttp(email)
        if (success) {
            emailVerification.sources.push(source)
            emailVerification.exists = success
        }

        return emailVerification
    }

    private async verifyViaSmtp(email: string): Promise<SMTPVerificationResult> {
        try {
            return await this.smtpVerifier.verify({
                email,
            })
        } catch (error) {
            ok(isNativeError(error))

            this.logger.error(`SMTP verification failed: ${error.message}`)
            return {}
        }
    }

    private async verifyViaHttp(email: string): Promise<CatchAllVerificationResult> {
        try {
            return await this.catchAllVerifier.tryAll(email)
        } catch (error) {
            ok(isNativeError(error))

            this.logger.error(`Catch-All verification failed: ${error.message}`)
            return { source: 'None', success: false }
        }
    }
}
