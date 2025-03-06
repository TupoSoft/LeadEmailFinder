import { type DNSCache, getSecondLevelDomain } from '../dns'
import type { SmtpClient } from './client'
import type { SmtpVerificationResult, SmtpVerifyResponse } from './dto'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyRepository } from '../proxy'
import { isNativeError } from 'node:util/types'
import type { SmtpClientCreator } from './client-creator'
import { isIP } from 'node:net'
import { isEmptyArray, ZERO } from '../common'
import { SmtpNegativeStatusCode } from './enums'
import type { SmtpVerificationResultRepository } from './repository'

export interface ISmtpVerifier {
    verify: (params: VerifyParams) => Promise<SmtpVerifyResponse>
}

export interface VerifyParams {
    email: string
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

interface GetProxiesParams {
    exchanges?: string[]
    proxyId?: string
}

type SmtpErrorHandlingStrategy = [(error: SmtpError) => boolean, (error: SmtpError) => SmtpVerificationResult]

export class SmtpVerifier implements ISmtpVerifier {
    private static readonly smtpErrorHandlingStrategies: SmtpErrorHandlingStrategy[] = [
        [
            ({ targetExchange, message }) =>
                /mimecast/i.exec(targetExchange) != null && /Administrative prohibition/i.exec(message) != null,
            ({ targetExchange, proxyId }) => ({
                targetExchange,
                exists: null,
                reason: 'sender_blocked',
                proxyId,
            }),
        ],
        [
            ({ message }) => /block|banned|rbl/i.exec(message) != null,
            ({ proxyId, targetExchange }) => ({
                exists: null,
                targetExchange,
                reason: 'blacklisted',
                proxyId,
            }),
        ],
        [
            () => true,
            ({ code, targetExchange, proxyId }) => {
                switch (code) {
                    case SmtpNegativeStatusCode.MailboxUnavailable:
                    case SmtpNegativeStatusCode.RequestedCommandFailed:
                        return {
                            exists: null,
                            targetExchange,
                            reason: 'temporarily_blocked',
                            proxyId,
                        }
                    case SmtpNegativeStatusCode.MailboxBusy:
                    case SmtpNegativeStatusCode.InvalidTransaction:
                        return {
                            exists: false,
                            targetExchange,
                            reason: 'rejected_email',
                            proxyId,
                        }
                    case SmtpNegativeStatusCode.MailboxFull:
                        return {
                            exists: null,
                            targetExchange,
                            reason: 'exceeded_storage',
                            proxyId,
                        }
                    default:
                        return {
                            exists: null,
                            targetExchange,
                            reason: 'unexpected_error',
                            proxyId,
                        }
                }
            },
        ],
    ]

    constructor(
        private readonly dnsCache: DNSCache,
        private readonly proxyRepository: ProxyRepository,
        private readonly smtpClientCreator: SmtpClientCreator,
        private readonly smtpVerificationResultRepository: SmtpVerificationResultRepository,
    ) {}

    private static isTemporarilyBlocked(result: Pick<SmtpVerifyResponse, 'reason'> | null): result is {
        reason: 'temporarily_blocked'
    } {
        return result?.reason === 'temporarily_blocked'
    }

    private static hasEmailVerificationOutcome(result: Pick<SmtpVerifyResponse, 'exists'> | null): result is {
        exists: boolean
    } {
        return result?.exists != null
    }

    verify = async ({ email }: VerifyParams): Promise<SmtpVerifyResponse> => {
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

    private async handleSmtpError(error: SmtpError): Promise<SmtpVerificationResult> {
        const strategy = SmtpVerifier.smtpErrorHandlingStrategies.find(([predicate]) => predicate(error))
        const { targetExchange, proxyId } = error

        if (strategy == null) {
            return {
                exists: null,
                reason: 'unexpected_error',
                proxyId,
                targetExchange,
            }
        }

        const [, handleError] = strategy
        const result = handleError(error)

        if (result.reason === 'blacklisted' && proxyId != null) {
            await this.proxyRepository.update(proxyId, {
                blacklistsToAdd: [targetExchange],
            })
        }

        return result
    }

    private async getExchanges({ domain, targetExchange }: GetExchangesParams): Promise<string[]> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const exchanges = mxRecords.map(({ exchange }) => exchange)
        return targetExchange != null ? exchanges.filter(exchange => exchange === targetExchange) : exchanges
    }

    private async tryVerify({ client, email }: TryVerifyParams): Promise<SmtpVerifyResponse> {
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
                const result = await this.handleSmtpError(error)
                return { ...result, email }
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
            const proxies = await this.getProxies({ exchanges, proxyId })

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

            return client
        } catch (error) {
            return null
        }
    }

    private async getProxies({ exchanges, proxyId }: GetProxiesParams): Promise<Proxy[]> {
        if (proxyId == null) {
            return await this.proxyRepository.getAll({ blacklistsExclude: exchanges })
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
            ok(isNativeError(error), new Error(String(error)))

            if (error instanceof SmtpError) {
                await this.handleSmtpError(error)
            }

            throw error
        }
    }
}
