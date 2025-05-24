import {
    EmailVerificationReason,
    EmailVerificationSource,
    ICatchAllVerifier,
    IEmailVerifier,
    ISmtpVerifier,
} from '../common'
import { EmailVerificationRequestDto, EmailVerificationResultDto } from './dto'
import { getSecondLevelDomain } from '../dns-module'
import { isEmailVerificationSource } from './type-guards'
import { Inject, Injectable } from '@nestjs/common'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verification.constants'

@Injectable()
export class EmailVerifier implements IEmailVerifier {
    private static readonly CATCH_ALL_EMAIL_USERNAME = 'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak'

    constructor(
        @Inject(SMTP_VERIFIER_TOKEN) private readonly smtpVerifier: ISmtpVerifier,
        @Inject(CATCH_ALL_VERIFIERS_TOKEN) private readonly catchAllEmailVerifiers: ICatchAllVerifier[],
    ) {}

    private static shouldVerifyViaHttp(
        emailVerification: EmailVerificationResultDto,
    ): emailVerification is EmailVerificationResultDto &
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

    async verify({ email, format }: EmailVerificationRequestDto): Promise<EmailVerificationResultDto> {
        const [localPart, domain] = email.split('@')

        const emailVerification: EmailVerificationResultDto = {
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
        const { exists, targetExchange, reason } = await this.smtpVerifier.verify(wrongEmail)

        emailVerification.targetExchange = targetExchange
        emailVerification.mxDomain = EmailVerifier.extractMxDomain(targetExchange)
        emailVerification.reason = reason as EmailVerificationReason
        emailVerification.catchAll = exists

        if (exists === false) {
            const { exists, targetExchange, reason } = await this.smtpVerifier.verify(email)
            emailVerification.exists = exists
            emailVerification.reason = reason as EmailVerificationReason

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
