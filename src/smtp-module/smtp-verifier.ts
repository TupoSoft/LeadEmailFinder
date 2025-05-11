import { IProxy, ISmtpVerifier } from './interfaces'
import { IDnsService, IProxyService, isEmptyArray, ZERO } from '../common'
import { isIP } from 'node:net'
import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import { SmtpErrorStatusCode, SmtpVerificationReason } from './enums'
import { SmtpException } from './exceptions'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { SmtpClient } from './smtp-client'
import { Model } from 'mongoose'
import { SmtpVerification } from './smtp-verification.schema'
import { SmtpVerificationResponse } from './dto'
import { DNS_SERVICE_TOKEN, PROXY_SERVICE_TOKEN } from './smtp.constants'
import { InjectModel } from '@nestjs/mongoose'
import { getSecondLevelDomain } from '../dns-module'

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

type SmtpErrorHandlingStrategy = [
    (error: SmtpException) => boolean,
    (error: SmtpException) => Omit<SmtpVerificationResponse, 'email'>,
]

@Injectable()
export class SmtpVerifier implements ISmtpVerifier {
    private static readonly smtpErrorHandlingStrategies: SmtpErrorHandlingStrategy[] = [
        [
            ({ targetExchange, message }) =>
                /mimecast/i.exec(targetExchange) != null && /Administrative prohibition/i.exec(message) != null,
            ({ targetExchange, proxyId }) => ({
                targetExchange,
                exists: null,
                reason: SmtpVerificationReason.SenderBlocked,
                proxyId,
            }),
        ],
        [
            ({ message }) => /block|banned|rbl/i.exec(message) != null,
            ({ proxyId, targetExchange }) => ({
                exists: null,
                targetExchange,
                reason: SmtpVerificationReason.Blocked,
                proxyId,
            }),
        ],
        [
            () => true,
            ({ code, targetExchange, proxyId }) => {
                switch (code) {
                    case SmtpErrorStatusCode.MailboxUnavailable:
                    case SmtpErrorStatusCode.RequestedCommandFailed:
                        return {
                            exists: null,
                            targetExchange,
                            reason: SmtpVerificationReason.TemporarilyBlocked,
                            proxyId,
                        }
                    case SmtpErrorStatusCode.MailboxBusy:
                    case SmtpErrorStatusCode.InvalidTransaction:
                        return {
                            exists: false,
                            targetExchange,
                            reason: SmtpVerificationReason.RejectedEmail,
                            proxyId,
                        }
                    case SmtpErrorStatusCode.MailboxFull:
                        return {
                            exists: null,
                            targetExchange,
                            reason: SmtpVerificationReason.ExceededStorage,
                            proxyId,
                        }
                    default:
                        return {
                            exists: null,
                            targetExchange,
                            reason: SmtpVerificationReason.UnexpectedError,
                            proxyId,
                        }
                }
            },
        ],
    ]

    @Inject()
    @Optional()
    private readonly logger = new Logger(SmtpVerifier.name)

    constructor(
        @Inject(DNS_SERVICE_TOKEN) private readonly dnsCache: IDnsService,
        @Inject(PROXY_SERVICE_TOKEN) private readonly proxyService: IProxyService,
        @InjectModel(SmtpVerification.name) private readonly smtpVerificationModel: Model<SmtpVerification>,
    ) {}

    private static isTemporarilyBlocked(result: Pick<SmtpVerificationResponse, 'reason'> | null): result is {
        reason: SmtpVerificationReason.TemporarilyBlocked
    } {
        return result?.reason === SmtpVerificationReason.TemporarilyBlocked
    }

    private static hasEmailVerificationOutcome(result: Pick<SmtpVerificationResponse, 'exists'> | null): result is {
        exists: boolean
    } {
        return result?.exists != null
    }

    verify = async (email: string): Promise<SmtpVerificationResponse> => {
        const [, domain] = email.split('@')

        const getExchangesParams: GetExchangesParams = { domain }
        const getSmtpClientParams: GetSmtpClientParams = { exchanges: [] }

        const cachedResult = await this.smtpVerificationModel.findById(email)
        if (SmtpVerifier.hasEmailVerificationOutcome(cachedResult)) {
            const { _id: email, exists, targetExchange, reason } = cachedResult

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
                reason: SmtpVerificationReason.NoMxRecords,
            }
        }

        const client = await this.getSmtpClient(getSmtpClientParams)
        if (client == null) {
            return {
                email,
                exists: null,
                reason: SmtpVerificationReason.NoConnect,
            }
        }

        const result = await this.tryVerify({ client, email })

        await this.smtpVerificationModel.insertOne(result)

        return result
    }

    private async handleSmtpError(error: SmtpException): Promise<Omit<SmtpVerificationResponse, 'email'>> {
        const strategy = SmtpVerifier.smtpErrorHandlingStrategies.find(([predicate]) => predicate(error))
        const { targetExchange, proxyId } = error

        if (strategy == null) {
            return {
                exists: null,
                reason: SmtpVerificationReason.UnexpectedError,
                proxyId,
                targetExchange,
            }
        }

        const [, handleError] = strategy
        const result = handleError(error)

        if (result.reason === SmtpVerificationReason.Blocked && proxyId != null) {
            await this.proxyService.addToBlacklist(proxyId, targetExchange)
        }

        return result
    }

    private async getExchanges({ domain, targetExchange }: GetExchangesParams): Promise<string[]> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const exchanges = mxRecords.map(({ exchange }) => exchange)
        return targetExchange != null ? exchanges.filter(exchange => exchange === targetExchange) : exchanges
    }

    private async tryVerify({ client, email }: TryVerifyParams): Promise<SmtpVerificationResponse> {
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
                reason: SmtpVerificationReason.AcceptedEmail,
                targetExchange,
            }
        } catch (error) {
            if (error instanceof SmtpException) {
                const result = await this.handleSmtpError(error)
                return { ...result, email }
            }

            return {
                email,
                exists: null,
                reason: SmtpVerificationReason.UnexpectedError,
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
            if (isNativeError(error)) {
                this.logger.error(`Error while connecting to SMTP server: ${error.message}`)
            }

            return null
        }
    }

    private async getProxies({ exchanges, proxyId }: GetProxiesParams): Promise<IProxy[]> {
        if (proxyId == null) {
            return await this.proxyService.get({
                blacklists: {
                    $nin: [exchanges],
                },
            })
        } else {
            const proxy = await this.proxyService.getById(proxyId)
            return proxy != null ? [proxy] : []
        }
    }

    private async tryConnect(exchange: string, proxy: IProxy, signal?: AbortSignal): Promise<SmtpClient> {
        try {
            const client = new SmtpClient({
                host: exchange,
                proxy,
                signal,
            })

            await client.connect()

            return client
        } catch (error) {
            ok(isNativeError(error), new Error(String(error)))

            if (error instanceof SmtpException) {
                await this.handleSmtpError(error)
            }

            throw error
        }
    }
}
