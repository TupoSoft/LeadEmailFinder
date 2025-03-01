import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import type { SmtpVerificationResult } from './dto'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyRepository } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientCreator } from './client-creator'
import { isIP } from 'node:net'
import { isEmptyArray, ZERO } from '../common'
import { SmtpNegativeStatusCode } from './enums'
import type { SmtpVerificationResultRepository } from './repository'

export interface VerifyParams {
    email: string
}

export interface ISmtpVerifier {
    verify: (params: VerifyParams) => Promise<SmtpVerificationResult>
}

interface GetExchangesParams {
    domain: string
    targetExchange?: string
}

interface TryVerifyParams {
    client: SmtpClient
    email: string
}

interface GetSmtpClientParams {
    exchanges: string[]
    proxyId?: string
}

export class SmtpVerifier implements ISmtpVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly proxyRepository: ProxyRepository,
        private readonly smtpClientCreator: SmtpClientCreator,
        private readonly smtpVerificationResultRepository: SmtpVerificationResultRepository,
    ) {}

    private static handleSmtpError(
        email: string,
        { code, message, targetExchange, proxyId }: SmtpError,
    ): SmtpVerificationResult {
        if (/block|banned/.exec(message) != null) {
            return {
                email,
                exists: null,
                targetExchange,
                reason: 'blacklisted',
                proxyId,
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
                    proxyId,
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
                    proxyId,
                }
            case SmtpNegativeStatusCode.MailboxBusy:
                return {
                    email,
                    exists: false,
                    targetExchange,
                    reason: 'rejected_email',
                    proxyId,
                }
            case SmtpNegativeStatusCode.InvalidTransaction:
                return {
                    email,
                    exists: null,
                    targetExchange,
                    reason: 'blacklisted',
                    proxyId,
                }
        }
    }

    private static isTemporarilyBlocked(result: Pick<SmtpVerificationResult, 'reason'> | null): result is {
        reason: 'temporarily_blocked'
    } {
        return result?.reason === 'temporarily_blocked'
    }

    private static hasEmailVerificationOutcome(result: Pick<SmtpVerificationResult, 'exists'> | null): result is {
        exists: boolean
    } {
        return result?.exists != null
    }

    verify = async ({ email }: VerifyParams): Promise<SmtpVerificationResult> => {
        const [, domain] = email.split('@')

        const getExchangesParams: GetExchangesParams = { domain }
        const getSmtpClientParams: GetSmtpClientParams = { exchanges: [] }

        const cachedResult = await this.smtpVerificationResultRepository.getById(email)
        if (SmtpVerifier.hasEmailVerificationOutcome(cachedResult)) {
            const { email, exists, targetExchange, reason } = cachedResult

            return {
                email,
                exists,
                targetExchange,
                reason,
            }
        }

        if (SmtpVerifier.isTemporarilyBlocked(cachedResult)) {
            const { proxyId, targetExchange } = cachedResult

            getExchangesParams.targetExchange = targetExchange
            getSmtpClientParams.proxyId = proxyId
        }

        getSmtpClientParams.exchanges = await this.getExchanges(getExchangesParams)
        if (isEmptyArray(getSmtpClientParams.exchanges)) {
            return {
                email,
                exists: false,
                reason: 'no_mx_records',
            }
        }

        const client = await this.getSmtpClient(getSmtpClientParams)
        if (client == null) {
            return {
                email,
                exists: null,
                reason: 'no_connect',
            }
        }

        const result = await this.tryVerify({ client, email })

        await this.smtpVerificationResultRepository.save(result)

        return result
    }

    private async getExchanges({ domain, targetExchange }: GetExchangesParams): Promise<string[]> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const exchanges = mxRecords.map(({ exchange }) => exchange)
        return targetExchange != null ? exchanges.filter(exchange => exchange === targetExchange) : exchanges
    }

    private async tryVerify({ client, email }: TryVerifyParams): Promise<SmtpVerificationResult> {
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
                return SmtpVerifier.handleSmtpError(email, error)
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

    private async getSmtpClient({ exchanges, proxyId }: GetSmtpClientParams): Promise<SmtpClient | null> {
        try {
            const proxies = await this.getProxies(proxyId)

            const connectPromises: Array<Promise<SmtpClient>> = []
            const exchangeProxyAbortControllerMap = new Map<string, AbortController>()
            for (const exchange of exchanges) {
                for (const proxy of proxies) {
                    const abortController = new AbortController()
                    exchangeProxyAbortControllerMap.set(`${exchange}-${proxy.host}`, abortController)
                    connectPromises.push(this.tryConnect(exchange, proxy, abortController.signal))
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

    private async getProxies(proxyId?: string): Promise<Proxy[]> {
        if (proxyId == null) {
            return await this.proxyRepository.getAll()
        } else {
            const proxy = await this.proxyRepository.getById(proxyId)
            return proxy != null ? [proxy] : []
        }
    }

    private async tryConnect(exchange: string, proxy: Proxy, signal?: AbortSignal): Promise<SmtpClient> {
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
