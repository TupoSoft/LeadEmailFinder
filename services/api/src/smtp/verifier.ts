import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import type { SmtpVerificationResult } from './dto'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyRepository } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientCreator } from './client-creator'
import { isIP } from 'node:net'
import { ZERO } from '../common'
import { SmtpNegativeStatusCode } from './enums'

export interface SMTPVerifyOptions {
    email: string
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SmtpVerificationResult>
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly proxyRepository: ProxyRepository,
        private readonly smtpClientCreator: SmtpClientCreator,
    ) {}

    private static handleSmtpError(
        email: string,
        { code, message, targetExchange }: SmtpError,
    ): SmtpVerificationResult {
        if (/block|banned/.exec(message) != null) {
            return {
                email,
                exists: null,
                targetExchange,
                reason: 'blocked',
            }
        }

        switch (code) {
            case SmtpNegativeStatusCode.MailboxUnavailable:
            case SmtpNegativeStatusCode.RequestedCommandFailed:
                return {
                    email,
                    exists: null,
                    targetExchange,
                    reason: 'temporarily_blocked',
                }
            case SmtpNegativeStatusCode.CommandUnrecognized:
            case SmtpNegativeStatusCode.SyntaxError:
            case SmtpNegativeStatusCode.CommandNotImplemented:
            case SmtpNegativeStatusCode.BadSequenceOfCommands:
            case SmtpNegativeStatusCode.CommandParameterNotImplemented:
                return {
                    email,
                    exists: null,
                    targetExchange,
                    reason: 'unexpected_error',
                }
            case SmtpNegativeStatusCode.MailboxBusy:
                return {
                    email,
                    exists: false,
                    targetExchange,
                    reason: 'rejected_email',
                }
            case SmtpNegativeStatusCode.InvalidTransaction:
                return {
                    email,
                    exists: null,
                    targetExchange,
                    reason: 'blocked',
                }
        }
    }

    verify: (opts: SMTPVerifyOptions) => Promise<SmtpVerificationResult> = async ({ email }) => {
        const [, domain] = email.split('@')

        const client = await this.getSmtpClient(domain)
        if (client == null) {
            return {
                email,
                exists: null,
                reason: 'no_connect',
            }
        }

        const { hostname, exchange: targetExchange } = client

        try {
            const [clientHostname] = isIP(hostname) !== ZERO ? await this.dnsCache.resolve(hostname, 'PTR') : [hostname]

            await client.helo(clientHostname)

            const clientDomain = getSecondLevelDomain(clientHostname)

            ok(clientDomain !== undefined, new Error(`Invalid client domain: ${clientDomain}`))

            const senderUsername = 'contact'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)
            await client.rcptTo(email)
            await client.quit()

            return {
                email,
                exists: true,
                reason: 'accepted_email',
                targetExchange,
            }
        } catch (error) {
            if (error instanceof SmtpError) {
                return SMTPVerifier.handleSmtpError(email, error)
            }

            return {
                email,
                exists: null,
                reason: 'unexpected_error',
            }
        } finally {
            client.end()
        }
    }

    private async getSmtpClient(domain: string): Promise<SmtpClient | null> {
        try {
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

            const client = await Promise.any(connectPromises)
            const { exchange, hostname } = client

            exchangeProxyAbortControllerMap.delete(`${exchange}-${hostname}`)

            for (const [, abortController] of exchangeProxyAbortControllerMap) {
                abortController.abort()
            }

            void Promise.allSettled(connectPromises)

            return client
        } catch (error) {
            return null
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
