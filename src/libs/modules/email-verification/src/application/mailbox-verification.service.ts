import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    fromStringToEnum,
} from '@tuposoft/lead-email-finder/common'
import { ok } from 'node:assert'
import { NewEmailVerification } from '../domain/email-verification'
import { deriveMxDomain } from '../domain/mx-domain'
import { MailboxProbe, MailboxProbeResult } from './ports/mailbox-probe'
import { AccountDiscovery } from './ports/account-discovery'

function isKnownSource(value: string): value is EmailVerificationSource {
    return Object.values(EmailVerificationSource as object).includes(value)
}

function shouldConsultAccountDiscovery(result: Pick<NewEmailVerification, 'catchAll' | 'reason'>): boolean {
    return result.catchAll === true || result.reason === EmailVerificationReason.Blacklisted
}

export class MailboxVerificationService {
    private static readonly CATCH_ALL_EMAIL_USERNAME = 'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak'

    constructor(
        private readonly mailboxProbe: MailboxProbe,
        private readonly accountDiscovery: AccountDiscovery,
    ) {}

    async verify(organizationId: string, email: string, format?: EmailPatternEnum): Promise<NewEmailVerification> {
        const [localPart, domain] = email.split('@')

        const result: NewEmailVerification = {
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.Unknown,
            sources: [],
            domain,
            localPart,
            email,
            format,
        }

        const wrongEmail = `${MailboxVerificationService.CATCH_ALL_EMAIL_USERNAME}@${domain}`
        const catchAllProbe = await this.probe(organizationId, wrongEmail)

        result.targetExchange = catchAllProbe.targetExchange
        result.mxDomain = deriveMxDomain(catchAllProbe.targetExchange)
        result.reason = catchAllProbe.reason
        result.catchAll = catchAllProbe.exists

        if (catchAllProbe.exists === false) {
            const realProbe = await this.probe(organizationId, email)

            result.exists = realProbe.exists
            result.reason = realProbe.reason

            if (realProbe.exists !== null) {
                result.targetExchange = realProbe.targetExchange
                result.mxDomain = deriveMxDomain(realProbe.targetExchange)
                result.sources.push(EmailVerificationSource.MX)
                return result
            }
        }

        if (shouldConsultAccountDiscovery(result)) {
            const sources = await this.discoverAccount(email)

            if (sources.length > 0) {
                result.sources.push(...sources)
                result.reason = EmailVerificationReason.Webmail
                result.exists = true
            }
        }

        return result
    }

    private async probe(
        organizationId: string,
        email: string,
    ): Promise<Omit<MailboxProbeResult, 'reason'> & { reason: EmailVerificationReason }> {
        const { reason: reasonString, ...rest } = await this.mailboxProbe.probe(organizationId, email)
        const reason = fromStringToEnum(EmailVerificationReason, reasonString)
        ok(reason, 'email_verification_reason_unknown')

        return { ...rest, reason }
    }

    private async discoverAccount(email: string): Promise<EmailVerificationSource[]> {
        const evidence = await this.accountDiscovery.discover(email)

        return evidence.flatMap(({ sourceName }) => {
            return isKnownSource(sourceName) ? [sourceName] : []
        })
    }
}
