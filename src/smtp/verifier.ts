import { type DNSCache, getSecondLevelDomain } from '../dns'
import { type ISMTPClient, SMTPClient } from './client'
import { appendRandomPrefix } from '../string-util'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'
import { SMTPClientError, SMTPVerificationAborted } from './errors'
import { ok } from 'node:assert'
import type { ProxyService } from '../proxy'
import type { ConnectionLimiter } from './connection-limiter'

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
        const { email, abortSignal } = opts

        if (abortSignal !== undefined) {
            abortSignal.onabort = () => {
                abortController.abort()
                throw new SMTPVerificationAborted(email)
            }
        }

        const [, domainName] = email.split('@')

        const proxies = await this.proxyService.getAll()
        const abortController = new AbortController()
        const client = new SMTPClient(this.dnsCache, this.connectionLimiter)
        const connectPromises = proxies.map(
            async proxy =>
                await client.connect({
                    proxy,
                    domain: domainName,
                    abortSignal: abortController.signal,
                }),
        )

        const exchange = await Promise.any(connectPromises)

        await Promise.allSettled(connectPromises)

        try {
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
            ok(error instanceof Error)
            handleError(error)
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
