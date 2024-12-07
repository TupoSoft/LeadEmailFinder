import type { SMTPClientFactory } from './client-factory'
import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SMTPClient } from './client'
import { appendRandomPrefix } from '../string-util'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'
import { SMTPClientError, SMTPVerificationAborted } from './errors'
import { ok } from 'node:assert'

export interface SMTPVerifyOptions {
    email: string
    abortSignal?: AbortSignal
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

function handleError(error: Error): void {
    if (error instanceof SMTPVerificationAborted) {
        throw error
    }
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly smtpClientFactory: SMTPClientFactory,
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
    ) {}

    private static async getNewCatchAllStatus(client: SMTPClient, domain: string): Promise<boolean | undefined> {
        try {
            await client.rcptTo(appendRandomPrefix(`danilo@${domain}`))
            return true
        } catch (error) {
            if (error instanceof SMTPClientError) {
                return false
            } else {
                return undefined
            }
        }
    }

    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult> = async opts => {
        const smtpVerificationResult: SMTPVerificationResult = {}
        const { email, abortSignal } = opts

        const [, domainName] = email.split('@')
        const client: SMTPClient = this.smtpClientFactory.getInstance()

        try {
            if (abortSignal !== undefined) {
                abortSignal.onabort = () => {
                    throw new SMTPVerificationAborted(email)
                }
            }

            const mxRecords = await this.dnsCache.resolve(domainName, 'MX')
            const { exchange } = await client.connect({ mxRecords })
            smtpVerificationResult.targetExchange = exchange
            smtpVerificationResult.mxDomain = getSecondLevelDomain(exchange)

            await client.helo()
            await client.mailFrom()

            smtpVerificationResult.catchAllStatus = await this.getCatchAllStatus(client, domainName)

            if (smtpVerificationResult.catchAllStatus === false) {
                smtpVerificationResult.exists = await client.rcptTo(email).then(
                    _ => true,
                    (_: unknown) => false,
                )
            }

            await client.quit()
        } catch (error) {
            ok(error instanceof Error)
            handleError(error)
        }

        return smtpVerificationResult
    }

    private async getCatchAllStatus(client: SMTPClient, domain: string): Promise<boolean | undefined> {
        const existingCatchAllStatus = await this.catchAllCache.getCatchAllStatusForDomain(domain)

        if (existingCatchAllStatus !== undefined) {
            return existingCatchAllStatus
        } else {
            const catchAllStatus = await SMTPVerifier.getNewCatchAllStatus(client, domain)

            if (catchAllStatus !== undefined) {
                await this.catchAllCache.setCatchAllStatusForDomain(domain, catchAllStatus)
            }

            return catchAllStatus
        }
    }
}

export class MockSMTPVerifier implements ISMTPVerifier {
    verify!: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}
