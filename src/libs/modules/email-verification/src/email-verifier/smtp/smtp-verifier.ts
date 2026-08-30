import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import { isIP } from 'node:net'
import { IDnsService, ISmtpVerificationResponse, ISmtpVerifier } from '@tuposoft/lead-email-finder/common'
import {
    ALLOCATION_OBSERVER_TOKEN,
    ConnectionOutcomeEvent,
    IAllocationObserver,
    IProxy,
    IProxyAllocator,
    IProxyService,
    LeasedProxy,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/modules/proxy'
import { SmtpVerification } from './smtp-verification.entity'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DNS_SERVICE_TOKEN, SMTP_CLIENT_FACTORY_TOKEN } from './smtp.constants'
import { SmtpException } from './smtp.exception'
import { SmtpErrorStatusCode, SmtpVerificationReason } from './smtp.enums'
import { getDomain } from 'tldts'
import { ISmtpClient } from './smtp-client.interface'
import { ISmtpClientFactory } from './smtp-client-factory.interface'

interface GetExchangesParams {
    domain: string
    targetExchange?: string
}

interface TryVerifyParams {
    client: ISmtpClient
    email: string
}

interface GetSmtpClientParams {
    exchanges: string[]
    proxyId?: string
}

interface LeasedSmtpClient {
    client: ISmtpClient
    allocation: LeasedProxy
}

interface SmtpClientAcquisition {
    leasedClient?: LeasedSmtpClient
    attemptedConnection: boolean
}

type SmtpErrorHandlingStrategy = [
    (error: SmtpException) => boolean,
    (error: SmtpException) => Omit<ISmtpVerificationResponse, 'email'>,
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

    private readonly logger = new Logger(SmtpVerifier.name)

    constructor(
        @Inject(DNS_SERVICE_TOKEN) private readonly dnsService: IDnsService,
        @Inject(PROXY_SERVICE_TOKEN) private readonly proxyService: IProxyService,
        @Inject(PROXY_ALLOCATOR_TOKEN) private readonly proxyAllocator: IProxyAllocator,
        @Inject(SMTP_CLIENT_FACTORY_TOKEN) private readonly smtpClientFactory: ISmtpClientFactory,
        @InjectRepository(SmtpVerification) private readonly smtpVerificationRepo: Repository<SmtpVerification>,
        @Inject(ALLOCATION_OBSERVER_TOKEN) private readonly allocationObserver: IAllocationObserver,
    ) {}

    private static isTemporarilyBlocked(result: Pick<SmtpVerification, 'reason'> | null): result is {
        reason: SmtpVerificationReason.TemporarilyBlocked
    } {
        return result?.reason === SmtpVerificationReason.TemporarilyBlocked
    }

    private static hasEmailVerificationOutcome(result: Pick<SmtpVerification, 'exists'> | null): result is {
        exists: boolean
    } {
        return result?.exists != null
    }

    verify = async (email: string): Promise<ISmtpVerificationResponse> => {
        const [, domain] = email.split('@')

        const getExchangesParams: GetExchangesParams = { domain }
        const getSmtpClientParams: GetSmtpClientParams = { exchanges: [] }

        const cachedResult = await this.smtpVerificationRepo.findOneBy({ id: email })
        if (SmtpVerifier.hasEmailVerificationOutcome(cachedResult)) {
            const { id: cachedEmail, exists, targetExchange, reason } = cachedResult

            return {
                email: cachedEmail,
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
        if (getSmtpClientParams.exchanges.length === 0) {
            return {
                email,
                exists: false,
                reason: SmtpVerificationReason.NoMxRecords,
            }
        }

        const { leasedClient, attemptedConnection } = await this.getSmtpClient(getSmtpClientParams)
        if (leasedClient == null) {
            return {
                email,
                exists: null,
                reason: attemptedConnection ? SmtpVerificationReason.NoConnect : SmtpVerificationReason.Unknown,
            }
        }

        let result: ISmtpVerificationResponse
        try {
            result = await this.tryVerify({ client: leasedClient.client, email })
        } finally {
            await this.releaseAllocation(leasedClient.allocation)
        }

        let smtpRecord = await this.smtpVerificationRepo.findOneBy({ id: email })
        smtpRecord ??= this.smtpVerificationRepo.create({ id: email })
        Object.assign(smtpRecord, result)
        await this.smtpVerificationRepo.save(smtpRecord)

        return result
    }

    private async handleSmtpError(error: SmtpException): Promise<Omit<ISmtpVerificationResponse, 'email'>> {
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
        const mxRecords = await this.dnsService.resolve(domain, 'MX')
        const exchanges = mxRecords.map(({ exchange }) => exchange)
        return targetExchange != null ? exchanges.filter(exchange => exchange === targetExchange) : exchanges
    }

    private async tryVerify({ client, email }: TryVerifyParams): Promise<ISmtpVerificationResponse> {
        const { hostname, exchange: targetExchange } = client

        try {
            const [clientHostname] = isIP(hostname) !== 0 ? await this.dnsService.resolve(hostname, 'PTR') : [hostname]

            await client.helo(clientHostname)

            const clientDomain = getDomain(clientHostname)

            ok(clientDomain !== null, new Error(`Invalid client domain: ${clientDomain}`))

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

    private async getSmtpClient({ exchanges, proxyId }: GetSmtpClientParams): Promise<SmtpClientAcquisition> {
        let attemptedConnection = false

        for (const exchange of exchanges) {
            const excludedProxyIds: string[] = []

            while (true) {
                let allocation: LeasedProxy | undefined
                try {
                    allocation = await this.proxyAllocator.acquire(exchange, proxyId, [...excludedProxyIds])
                } catch (error) {
                    this.logConnectionError(error)
                    return { attemptedConnection }
                }

                if (allocation === undefined) {
                    break
                }

                excludedProxyIds.push(allocation.proxy.id)
                attemptedConnection = true

                const connectStartedAt = Date.now()
                try {
                    const client = await this.tryConnect(exchange, allocation.proxy)
                    this.observeConnectionOutcome({
                        outcome: 'connected',
                        mxHost: exchange,
                        proxyId: allocation.proxy.id,
                        durationMs: Date.now() - connectStartedAt,
                    })
                    return { leasedClient: { client, allocation }, attemptedConnection }
                } catch (error) {
                    this.observeConnectionOutcome({
                        outcome: 'failed',
                        mxHost: exchange,
                        proxyId: allocation.proxy.id,
                        durationMs: Date.now() - connectStartedAt,
                    })
                    await this.releaseAllocation(allocation)
                    this.logConnectionError(error)

                    if (proxyId !== undefined) {
                        break
                    }
                }
            }
        }

        return { attemptedConnection }
    }

    private async releaseAllocation(allocation: LeasedProxy): Promise<void> {
        try {
            await this.proxyAllocator.release(allocation)
        } catch (error) {
            this.logConnectionError(error)
        }
    }

    private logConnectionError(error: unknown): void {
        if (isNativeError(error)) {
            this.logger.error(`Error while connecting to SMTP server: ${error.message}`)
        }
    }

    // Observability must never break verification: a failing observer call is swallowed here.
    private observeConnectionOutcome(event: ConnectionOutcomeEvent): void {
        try {
            this.allocationObserver.onConnectionOutcome(event)
        } catch {
            // intentionally ignored
        }
    }

    private async tryConnect(exchange: string, proxy: IProxy): Promise<ISmtpClient> {
        let client: ISmtpClient | undefined

        try {
            client = this.smtpClientFactory.create({
                host: exchange,
                proxy,
            })

            await client.connect()

            return client
        } catch (error) {
            client?.end()

            ok(isNativeError(error), new Error(String(error)))

            if (error instanceof SmtpException) {
                await this.handleSmtpError(error)
            }

            throw error
        }
    }
}
