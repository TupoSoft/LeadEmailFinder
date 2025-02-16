import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult, EmailVerificationSource } from './dto'
import { isNativeError } from 'node:util/types'
import { ok } from 'node:assert'
import type { SMTPVerificationResult } from '../smtp/dto'
import type { Logger } from 'logging'
import type { CatchAllEmailVerifier } from './http'
import { isEmptyArray } from '../common'
import { isEmailVerificationSource } from './type-guards'

export interface IEmailVerifier {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerifier implements IEmailVerifier {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly catchAllEmailVerifiers: CatchAllEmailVerifier[],
        private readonly logger: Logger = console,
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
        if (exists !== undefined) {
            emailVerification.exists = exists
            emailVerification.targetExchange = targetExchange
            emailVerification.mxDomain = mxDomain
            emailVerification.sources.push('SMTP')
            return emailVerification
        }

        const sources = await this.verifyViaHttp(email)
        if (!isEmptyArray(sources)) {
            emailVerification.sources.push(...sources)
            emailVerification.exists = true
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

            this.logger.error(`SMTP verification failed for email ${email}: ${error.message}`)
            return {}
        }
    }

    private async verifyViaHttp(email: string): Promise<EmailVerificationSource[]> {
        const sources: EmailVerificationSource[] = []

        const promiseSettledResult = await Promise.allSettled(
            this.catchAllEmailVerifiers.map(async httpVerifier => await httpVerifier.verify(email)),
        )

        promiseSettledResult.forEach((promiseSettledResultItem, index) => {
            if (promiseSettledResultItem.status === 'fulfilled' && promiseSettledResultItem.value) {
                const {
                    catchAllEmailVerifiers: {
                        [index]: {
                            constructor: { name: source },
                        },
                    },
                } = this

                if (isEmailVerificationSource(source)) {
                    sources.push(source)
                }
            }
        })

        return sources
    }
}
