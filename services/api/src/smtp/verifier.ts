import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import type { SMTPVerificationResult } from './dto'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyRepository } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientCreator } from './client-creator'
import { isIP } from 'node:net'
import { ZERO } from '../common'
import { SmtpResponseCode } from './enums'

export interface SMTPVerifyOptions {
    email: string
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly proxyRepository: ProxyRepository,
        private readonly smtpClientCreator: SmtpClientCreator,
    ) {}

    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult> = async ({ email }) => {
        const [, domain] = email.split('@')

        const client = await this.getSmtpClient(domain)
        const { hostname, exchange: targetExchange } = client

        try {
            const [clientHostname] = isIP(hostname) !== ZERO ? await this.dnsCache.resolve(hostname, 'PTR') : [hostname]

            await client.helo(clientHostname)

            const clientDomain = getSecondLevelDomain(clientHostname)

            ok(clientDomain !== undefined, new Error(`Invalid client domain: ${clientDomain}`))

            const senderUsername = 'contact'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)

            const exists = await client.rcptTo(email).then(
                _ => true,
                (reason: unknown) => {
                    try {
                        ok(reason instanceof SmtpError)
                        const { code, message } = reason

                        ok(code >= (SmtpResponseCode.CommandUnrecognized as number))
                        ok(/block|banned/.exec(message) == null)

                        return false
                    } catch (error) {
                        return null
                    }
                },
            )

            await client.quit()

            return {
                exists,
                targetExchange,
            }
        } catch (error) {
            ok(isNativeError(error))

            return {
                exists: null,
                targetExchange,
            }
        } finally {
            client.end()
        }
    }

    private async getSmtpClient(domain: string): Promise<SmtpClient> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const proxies = await this.proxyRepository.getAll()

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
}
