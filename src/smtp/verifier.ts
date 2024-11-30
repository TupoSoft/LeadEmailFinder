import type { SMTPClientFactory } from './client-factory'
import type { DNSCache } from '../dns'
import type { SMTPClient } from './client'
import { getSecondLevelDomainSplit } from '../dns-util'
import { appendRandomPrefix } from '../string-util'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'

export interface SMTPVerifier {
    verify: (email: string) => Promise<SMTPVerificationResult>
}

export class SMTPVerifierImpl implements SMTPVerifier {
    constructor(
        private readonly smtpClientFactory: SMTPClientFactory,
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
    ) {}

    verify: (email: string) => Promise<SMTPVerificationResult> = async email => {
        const smtpVerificationResult: SMTPVerificationResult = {}

        const [, domainName] = email.split('@')
        const client: SMTPClient = this.smtpClientFactory.getInstance()

        try {
            const mxRecords = await this.dnsCache.resolve(domainName, 'MX')
            const mxRecord = await client.connect({ mxRecords })
            smtpVerificationResult.targetExchange = mxRecord.exchange
            smtpVerificationResult.mxDomain = getSecondLevelDomainSplit(mxRecord.exchange)

            await client.helo()
            await client.mailFrom()

            const existingCatchAllStatus = await this.catchAllCache.getCatchAllStatusForDomain(domainName)
            const catchAllStatus =
                existingCatchAllStatus ??
                (await client.rcptTo(appendRandomPrefix(email)).then(
                    _ => true,
                    _ => false,
                ))
            smtpVerificationResult.catchAllStatus = catchAllStatus

            if (existingCatchAllStatus === undefined) {
                await this.catchAllCache.setCatchAllStatusForDomain(domainName, catchAllStatus)
            }

            if (!catchAllStatus) {
                smtpVerificationResult.exists = await client.rcptTo(email).then(
                    _ => true,
                    _ => false,
                )
            }

            await client.quit()
        } catch (error) {}

        return smtpVerificationResult
    }
}

export class MockSMTPVerifier implements SMTPVerifier {
    verify!: (email: string) => Promise<SMTPVerificationResult>
}
