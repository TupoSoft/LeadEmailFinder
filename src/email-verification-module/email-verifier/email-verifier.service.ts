import {
    EmailVerificationReason,
    EmailVerificationSource,
    fromStringToEnum,
    ICatchAllVerifier,
    IEmailVerificationRequestDto,
    IEmailVerificationResultDto,
    IEmailVerifier,
    ISmtpVerifier,
} from '../../common'
import { getSecondLevelDomain } from './smtp/dns'
import { Inject, Injectable } from '@nestjs/common'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verifier.constants'
import { isEmailVerificationSource } from './email-verifier.type-guards'
import { ok } from 'node:assert'

@Injectable()
export class EmailVerifier implements IEmailVerifier {
    private static readonly CATCH_ALL_EMAIL_USERNAME = 'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak'

    constructor(
        @Inject(SMTP_VERIFIER_TOKEN) private readonly smtpVerifier: ISmtpVerifier,
        @Inject(CATCH_ALL_VERIFIERS_TOKEN) private readonly catchAllEmailVerifiers: ICatchAllVerifier[],
    ) {}

    private static shouldVerifyViaHttp(
        emailVerification: IEmailVerificationResultDto,
    ): emailVerification is IEmailVerificationResultDto &
        (
            | {
                  catchAll: true
              }
            | { reason: EmailVerificationReason }
        ) {
        return emailVerification.catchAll === true || emailVerification.reason === EmailVerificationReason.Blacklisted
    }

    private static extractMxDomain(targetExchange?: string): string | undefined {
        return getSecondLevelDomain(targetExchange ?? '')
    }

    async verify({ email, format }: IEmailVerificationRequestDto): Promise<IEmailVerificationResultDto> {
        const [localPart, domain] = email.split('@')

        const emailVerification: IEmailVerificationResultDto = {
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.Unknown,
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        const wrongEmail = `${EmailVerifier.CATCH_ALL_EMAIL_USERNAME}@${domain}`
        const { exists, targetExchange, reason: reasonString } = await this.smtpVerifier.verify(wrongEmail)
        const reason = fromStringToEnum(EmailVerificationReason, reasonString)
        ok(reason, `Unknown reason: ${reasonString}. Email: ${wrongEmail}`)

        emailVerification.targetExchange = targetExchange
        emailVerification.mxDomain = EmailVerifier.extractMxDomain(targetExchange)
        emailVerification.reason = reason
        emailVerification.catchAll = exists

        if (exists === false) {
            const { exists, targetExchange, reason: reasonString } = await this.smtpVerifier.verify(email)
            const reason = fromStringToEnum(EmailVerificationReason, reasonString)
            ok(reason, `Unknown reason: ${reasonString}. Email: ${wrongEmail}`)

            emailVerification.exists = exists
            emailVerification.reason = reason

            if (exists !== null) {
                emailVerification.targetExchange = targetExchange
                emailVerification.mxDomain = EmailVerifier.extractMxDomain(targetExchange)
                emailVerification.sources.push(EmailVerificationSource.MX)
                return emailVerification
            }
        }

        if (EmailVerifier.shouldVerifyViaHttp(emailVerification)) {
            const sources = await this.verifyViaHttp(email)

            if (sources.length > 0) {
                emailVerification.sources.push(...sources)
                emailVerification.reason = EmailVerificationReason.Webmail
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
