import type { ISmtpVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult, EmailVerificationSource } from './dto'
import type { CatchAllEmailVerifier } from './http'
import { isEmailVerificationSource } from './type-guards'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { booleanToCatchAllStatus, existsToDeliveryStatus } from './util'
import { getSecondLevelDomain } from '../dns'
import { isEmptyArray } from '../common'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerificationRunner implements IEmailVerificationRunner {
    private static readonly CATCH_ALL_EMAIL_USERNAME = 'lzulaeflfg'

    constructor(
        private readonly smtpVerifier: ISmtpVerifier,
        private readonly catchAllEmailVerifiers: CatchAllEmailVerifier[],
    ) {}

    private static shouldVerifyViaHttp(
        emailVerification: EmailVerificationResult,
    ): emailVerification is EmailVerificationResult &
        (
            | {
                  catchAll: CatchAllStatus.Enabled
              }
            | { reason: 'blacklisted' }
        ) {
        return emailVerification.catchAll === CatchAllStatus.Enabled || emailVerification.reason === 'blacklisted'
    }

    private static extractMxDomain(targetExchange?: string): string | undefined {
        return getSecondLevelDomain(targetExchange ?? '')
    }

    async verify({ email, format }: EmailVerificationRequest): Promise<EmailVerificationResult> {
        const [localPart, domain] = email.split('@')

        const emailVerification: EmailVerificationResult = {
            exists: null,
            deliveryStatus: DeliveryStatus.NotProcessed,
            catchAll: CatchAllStatus.Unknown,
            reason: 'unknown',
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        const wrongEmail = `${EmailVerificationRunner.CATCH_ALL_EMAIL_USERNAME}@${domain}`
        const { exists, targetExchange, reason } = await this.smtpVerifier.verify({ email: wrongEmail })

        emailVerification.targetExchange = targetExchange
        emailVerification.mxDomain = EmailVerificationRunner.extractMxDomain(targetExchange)
        emailVerification.reason = reason
        emailVerification.catchAll = booleanToCatchAllStatus(exists)
        emailVerification.deliveryStatus = existsToDeliveryStatus(exists)
        emailVerification.exists = exists

        if (emailVerification.exists === false) {
            const { exists, targetExchange, reason } = await this.smtpVerifier.verify({ email })
            emailVerification.deliveryStatus = existsToDeliveryStatus(exists)
            emailVerification.exists = exists
            emailVerification.reason = reason

            if (exists !== null) {
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = EmailVerificationRunner.extractMxDomain(targetExchange)
                emailVerification.sources.push('mx')
                return emailVerification
            }
        }

        if (EmailVerificationRunner.shouldVerifyViaHttp(emailVerification)) {
            const sources = await this.verifyViaHttp(email)

            if (!isEmptyArray(sources)) {
                emailVerification.sources.push(...sources)
                emailVerification.exists = true
            }
        }

        return emailVerification
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
                        [index]: { sourceName },
                    },
                } = this

                if (isEmailVerificationSource(sourceName)) {
                    sources.push(sourceName)
                }
            }
        })

        return sources
    }
}
