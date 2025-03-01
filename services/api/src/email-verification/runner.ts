import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult, EmailVerificationSource } from './dto'
import type { CatchAllEmailVerifier } from './http'
import { isEmailVerificationSource } from './type-guards'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { booleanToCatchAllStatus, existsToDeliveryStatus } from './util'
import { appendRandomPrefix } from '../util/string'
import { getSecondLevelDomain } from '../dns'
import type { CatchAllSmtpVerificationResultRepository } from './catch-all-cache'
import type { SmtpVerificationResult } from '../smtp/dto'
import { isEmptyArray } from '../common'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerificationRunner implements IEmailVerificationRunner {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly catchAllEmailVerifiers: CatchAllEmailVerifier[],
        private readonly catchAllCache: CatchAllSmtpVerificationResultRepository,
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

        const { exists, targetExchange, reason } = await this.checkCatchAllSmtpVerificationResult(email)

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

    private async checkCatchAllSmtpVerificationResult(email: string): Promise<SmtpVerificationResult> {
        const [, domain] = email.split('@')
        const cachedVerificationResult = await this.catchAllCache.getCatchAllSmtpVerificationResult(domain)

        if (cachedVerificationResult != null) {
            const { email, exists, targetExchange, reason } = cachedVerificationResult

            if (exists != null) {
                return {
                    email,
                    exists,
                    targetExchange,
                    reason,
                }
            } else {
                const smtpVerificationResult = await this.smtpVerifier.verify({
                    email,
                })

                await this.catchAllCache.setCatchAllSmtpVerificationResult(domain, smtpVerificationResult)

                return smtpVerificationResult
            }
        } else {
            const wrongEmail = appendRandomPrefix(email)
            const smtpVerificationResult = await this.smtpVerifier.verify({
                email: wrongEmail,
            })

            await this.catchAllCache.setCatchAllSmtpVerificationResult(domain, smtpVerificationResult)

            return smtpVerificationResult
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
