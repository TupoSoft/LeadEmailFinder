import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import { CatchAllStatus, type SMTPVerificationResult } from './dto'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyService } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientCreator } from './client-creator'
import { appendRandomPrefix } from '../util/string'
import { isIP } from 'node:net'
import { ZERO } from '../common'
import type { CatchAllCache } from './catch-all-cache'
import type { EmailVerifier } from '../email-verification'

export class SMTPVerifier implements EmailVerifier<SMTPVerificationResult> {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
        private readonly proxyService: ProxyService,
        private readonly smtpClientCreator: SmtpClientCreator,
    ) {}

    private static async getNewCatchAllStatus(client: SmtpClient, domain: string): Promise<CatchAllStatus> {
        try {
            await client.rcptTo(appendRandomPrefix(`danilo@${domain}`))
            return CatchAllStatus.Enabled
        } catch (error) {
            if (error instanceof SmtpError) {
                return CatchAllStatus.Disabled
            } else {
                return CatchAllStatus.Unknown
            }
        }
    }

    verify: (email: string) => Promise<SMTPVerificationResult> = async email => {
        const smtpVerificationResult: SMTPVerificationResult = {
            success: false,
        }

        const [, domain] = email.split('@')

        const client = await this.getSmtpClient(domain)
        const { hostname, exchange } = client
        smtpVerificationResult.mxRecord = exchange
        smtpVerificationResult.mxDomain = getSecondLevelDomain(exchange)

        try {
            const hostnames = isIP(hostname) !== ZERO ? await this.dnsCache.resolve(hostname, 'PTR') : [hostname]
            const [clientHostname] = hostnames

            await client.helo(clientHostname)

            const clientDomain = getSecondLevelDomain(clientHostname)

            ok(clientDomain !== undefined, new Error(`Invalid client domain: ${clientDomain}`))

            const senderUsername = 'danilo'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)

            smtpVerificationResult.catchAll = await this.getCatchAllStatus(client, domain)

            if (smtpVerificationResult.catchAll === CatchAllStatus.Disabled) {
                smtpVerificationResult.success = await client.rcptTo(email).then(
                    _ => true,
                    (_: unknown) => false,
                )
            }

            await client.quit()
        } catch (error) {
            ok(isNativeError(error))
            console.error(`Error in SMTPVerifier.verify: `, error)
        } finally {
            client.end()
        }

        return smtpVerificationResult
    }

    private async getSmtpClient(domain: string): Promise<SmtpClient> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const proxies = await this.proxyService.getAll()

        const connectPromises: Array<Promise<SmtpClient>> = []
        const exchangeProxyAbortControllerMap = new Map<string, AbortController>()
        for (const { exchange } of mxRecords) {
            for (const proxy of proxies) {
                const abortController = new AbortController()
                exchangeProxyAbortControllerMap.set(`${exchange}-${proxy.host}`, abortController)
                connectPromises.push(this.tryToConnect(exchange, proxy, abortController.signal))
            }
        }

        try {
            const client = await Promise.any(connectPromises)
            const { exchange, hostname } = client

            exchangeProxyAbortControllerMap.delete(`${exchange}-${hostname}`)

            for (const [, abortController] of exchangeProxyAbortControllerMap) {
                abortController.abort()
            }

            void Promise.allSettled(connectPromises)

            return client
        } catch (error) {
            ok(isNativeError(error))
            console.error(error.message)
            throw error
        }
    }

    private async tryToConnect(exchange: string, proxy: Proxy, signal?: AbortSignal): Promise<SmtpClient> {
        try {
            const client = this.smtpClientCreator.create({
                host: exchange,
                proxy,
                signal,
            })

            await client.connect()

            return client
        } catch (error) {
            ok(isNativeError(error))
            throw error
        }
    }

    private async getCatchAllStatus(client: SmtpClient, domain: string): Promise<CatchAllStatus> {
        const existingCatchAllStatus = await this.catchAllCache.getCatchAllStatusForDomain(domain)

        if (existingCatchAllStatus !== CatchAllStatus.Unknown) {
            return existingCatchAllStatus
        } else {
            const catchAllStatus = await SMTPVerifier.getNewCatchAllStatus(client, domain)

            if (catchAllStatus !== CatchAllStatus.Unknown) {
                await this.catchAllCache.setCatchAllStatusForDomain(domain, catchAllStatus)
            }

            return catchAllStatus
        }
    }
}

export class MockSMTPVerifier implements EmailVerifier<SMTPVerificationResult> {
    verify!: (email: string) => Promise<SMTPVerificationResult>
}
