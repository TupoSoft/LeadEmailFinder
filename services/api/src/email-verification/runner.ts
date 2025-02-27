import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationRequest, EmailVerificationResult, EmailVerificationSource } from './dto'
import type { CatchAllEmailVerifier } from './http'
import { isEmptyArray } from '../common'
import { isEmailVerificationSource } from './type-guards'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { booleanToCatchAllStatus, existsToDeliveryStatus } from './util'
import { appendRandomPrefix } from '../util/string'
import { getSecondLevelDomain } from '../dns'
import type { CatchAllCache } from './catch-all-cache'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}

export class EmailVerificationRunner implements IEmailVerificationRunner {
    constructor(
        private readonly smtpVerifier: ISMTPVerifier,
        private readonly catchAllEmailVerifiers: CatchAllEmailVerifier[],
        private readonly catchAllCache: CatchAllCache,
    ) {}

    async verify({ email, format }: EmailVerificationRequest): Promise<EmailVerificationResult> {
        const [localPart, domain] = email.split('@')

        const emailVerification: EmailVerificationResult = {
            exists: null,
            deliveryStatus: DeliveryStatus.NotProcessed,
            catchAll: CatchAllStatus.Unknown,
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        const catchAllEnabled = await this.checkCatchAllStatus(domain)

        emailVerification.catchAll = booleanToCatchAllStatus(catchAllEnabled)
        emailVerification.deliveryStatus = existsToDeliveryStatus(null)

        if (catchAllEnabled === false) {
            const { exists, targetExchange } = await this.smtpVerifier.verify({ email })
            emailVerification.deliveryStatus = existsToDeliveryStatus(exists)
            emailVerification.exists = exists

            if (exists !== null) {
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = getSecondLevelDomain(targetExchange)
                emailVerification.sources.push('mx')
            }
        }

        const sources = await this.verifyViaHttp(email)
        if (!isEmptyArray(sources)) {
            emailVerification.sources.push(...sources)
            emailVerification.exists = true
        }

        return emailVerification
    }

    private async checkCatchAllStatus(domain: string): Promise<boolean | null> {
        const isCatchAllEnabled = await this.catchAllCache.isCatchAllEnabledForDomain(domain)

        if (isCatchAllEnabled != null) {
            return isCatchAllEnabled
        } else {
            const email = appendRandomPrefix(`@${domain}`)
            const { exists } = await this.smtpVerifier.verify({
                email,
            })

            if (exists != null) {
                await this.catchAllCache.setCatchAllEnabledForDomain(domain, exists)
            }

            return exists
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
