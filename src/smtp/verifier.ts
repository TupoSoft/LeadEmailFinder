import { type DNSCache, getSecondLevelDomain } from '../dns'
import { type ISMTPClient, SMTPClient } from './client'
import { appendRandomPrefix } from '../string-util'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'
import { SMTPClientError } from './errors'
import { ok } from 'node:assert'
import type { ProxyService } from '../proxy'
import type { ConnectionLimiter } from './connection-limiter'

export interface SMTPVerifyOptions {
    email: string
    signal?: AbortSignal
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
        private readonly proxyService: ProxyService,
        private readonly connectionLimiter: ConnectionLimiter,
    ) {}

    private static async getNewCatchAllStatus(client: ISMTPClient, domain: string): Promise<boolean | undefined> {
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
        const { email, signal } = opts

        const [, domainName] = email.split('@')

        const client = new SMTPClient(this.dnsCache, this.connectionLimiter)

        try {
            signal?.throwIfAborted()

            const proxies = await this.proxyService.getAll()

            const connectPromises = proxies.map(
                async proxy =>
                    await client.connect({
                        proxy,
                        domain: domainName,
                        signal,
                    }),
            )

            const exchange = await Promise.any(connectPromises)

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
        } catch (error) {
            console.error(`Error in SMTPVerifier.verify: `, error)
            ok(error instanceof Error)
            throw error
        } finally {
            await client.quit()
        }

        return smtpVerificationResult
    }

    private async getCatchAllStatus(client: ISMTPClient, domain: string): Promise<boolean | undefined> {
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
