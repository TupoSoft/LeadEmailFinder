import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyService } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientFactory } from './client-factory'
import { appendRandomPrefix } from '../util/string'

export interface SMTPVerifyOptions {
    email: string
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
        private readonly proxyService: ProxyService,
        private readonly smtpClientFactory: SmtpClientFactory,
    ) {}

    private static async getNewCatchAllStatus(client: SmtpClient, domain: string): Promise<boolean | undefined> {
        try {
            await client.rcptTo(appendRandomPrefix(`danilo@${domain}`))
            return true
        } catch (error) {
            if (error instanceof SmtpError) {
                return false
            } else {
                return undefined
            }
        }
    }

    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult> = async opts => {
        const smtpVerificationResult: SMTPVerificationResult = {}
        const { email } = opts

        const [, domain] = email.split('@')

        const client = await this.getSmtpClient(domain)

        try {
            await client.isReady()

            const hostnames = await this.dnsCache.resolve(client.hostname, 'PTR')
            const [clientHostname] = hostnames

            await client.helo(clientHostname)

            const clientDomain = getSecondLevelDomain(clientHostname)

            ok(clientDomain !== undefined, new Error(`Invalid client domain: ${clientDomain}`))

            const senderUsername = 'danilo'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)

            smtpVerificationResult.catchAllStatus = await this.getCatchAllStatus(client, domain)

            if (smtpVerificationResult.catchAllStatus === false) {
                smtpVerificationResult.exists = await client.rcptTo(email).then(
                    _ => true,
                    (_: unknown) => false,
                )
            }
        } catch (error) {
            ok(isNativeError(error))
            console.error(`Error in SMTPVerifier.verify: `, error)
            throw error
        } finally {
            void client.quit()
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
            const client = this.smtpClientFactory.getClient()

            await client.connect({
                exchange,
                proxy,
                signal,
            })

            return client
        } catch (error) {
            ok(isNativeError(error))
            throw error
        }
    }

    private async getCatchAllStatus(client: SmtpClient, domain: string): Promise<boolean | undefined> {
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
