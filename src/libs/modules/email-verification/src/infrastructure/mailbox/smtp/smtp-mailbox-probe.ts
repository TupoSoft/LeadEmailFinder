import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import { isIP } from 'node:net'
import { IDnsService, safeErrorType } from '@tuposoft/lead-email-finder/common'
import {
    ConnectionOutcomeEvent,
    IAllocationObserver,
    IProxy,
    IProxyAllocator,
    IProxyService,
    LeasedProxy,
} from '@tuposoft/lead-email-finder/modules/proxy'
import { Logger } from '@nestjs/common'
import { getDomain } from 'tldts'
import { MailboxProbe, MailboxProbeResult } from '../../../application/ports/mailbox-probe'
import { MxResolver } from '../../../application/ports/mx-resolver'
import { SmtpVerificationStore, SmtpVerificationUpdate } from '../../../application/ports/smtp-verification-store'
import { VerificationClock } from '../../../application/ports/verification-clock'
import { SmtpVerification } from '../../../domain/smtp-verification'
import {
    deriveMailboxEvidence,
    MailboxEvidence,
    NO_MAILBOX_EVIDENCE,
    VERIFICATION_EVIDENCE_POLICY_VERSION,
} from '../../../domain/verification-evidence'
import { ISmtpClient } from './smtp-client.interface'
import { ISmtpClientFactory } from './smtp-client-factory.interface'
import { SmtpException } from './smtp.exception'
import { SmtpSecureTransportUnavailableException } from '../../smtp/smtp-secure-transport-unavailable.exception'
import { SmtpErrorStatusCode, SmtpVerificationReason } from './smtp.enums'

const EVIDENCE_FRESHNESS_MS = 24 * 60 * 60 * 1000

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
    (error: SmtpException) => Omit<MailboxProbeResult, 'email' | 'evidence'>,
]

/** Implements the `MailboxProbe` port with the proxy-leased SMTP protocol, replacing module-architecture/18's compatibility wrapper. */
export class SmtpMailboxProbe implements MailboxProbe {
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
                    case SmtpErrorStatusCode.MailboxFull:
                        return {
                            exists: null,
                            targetExchange,
                            reason: SmtpVerificationReason.ExceededStorage,
                            proxyId,
                        }
                    default:
                        // Includes a generic recipient rejection without the exact evidence rule's enhanced
                        // status (checked and consumed earlier in tryVerify): it is ineligible proof, not a
                        // conclusive negative.
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

    private readonly logger = new Logger(SmtpMailboxProbe.name)

    constructor(
        private readonly dnsService: IDnsService,
        private readonly mxResolver: MxResolver,
        private readonly proxyService: IProxyService,
        private readonly proxyAllocator: IProxyAllocator,
        private readonly smtpClientFactory: ISmtpClientFactory,
        private readonly smtpVerificationStore: SmtpVerificationStore,
        private readonly allocationObserver: IAllocationObserver,
        private readonly clock: VerificationClock,
    ) {}

    private static isTemporarilyBlocked(
        result: Pick<SmtpVerification, 'reason' | 'secureTransport'> | null,
    ): result is { reason: SmtpVerificationReason.TemporarilyBlocked; secureTransport: true } {
        return result?.secureTransport === true && result.reason === SmtpVerificationReason.TemporarilyBlocked
    }

    /**
     * Reuse requires matching policy, verified transport, its own recipient proof, an observation no later than
     * now, and age strictly below 24 hours. A read never advances this age.
     */
    private static deriveStoredEvidence(cached: SmtpVerification | null, now: Date): MailboxEvidence {
        if (cached === null || cached.secureTransport !== true) return NO_MAILBOX_EVIDENCE
        if (cached.evidencePolicyVersion !== VERIFICATION_EVIDENCE_POLICY_VERSION) return NO_MAILBOX_EVIDENCE
        if (cached.evidenceObservedAt == null) return NO_MAILBOX_EVIDENCE

        const observedAtMs = cached.evidenceObservedAt.getTime()
        if (!Number.isFinite(observedAtMs)) return NO_MAILBOX_EVIDENCE

        const nowMs = now.getTime()
        if (observedAtMs > nowMs || nowMs - observedAtMs >= EVIDENCE_FRESHNESS_MS) return NO_MAILBOX_EVIDENCE

        if (cached.exists === true && cached.reason === SmtpVerificationReason.AcceptedEmail) {
            return {
                kind: 'smtp_recipient_accepted',
                observedAt: cached.evidenceObservedAt,
                policyVersion: cached.evidencePolicyVersion,
                origin: 'stored',
                stage: 'rcpt_to',
                code: 250,
                verifiedTransport: true,
                senderAccepted: true,
            }
        }

        if (cached.exists === false && cached.reason === SmtpVerificationReason.RejectedEmail) {
            return {
                kind: 'smtp_recipient_missing',
                observedAt: cached.evidenceObservedAt,
                policyVersion: cached.evidencePolicyVersion,
                origin: 'stored',
                stage: 'rcpt_to',
                code: 550,
                enhancedCode: '5.1.1',
                verifiedTransport: true,
                senderAccepted: true,
            }
        }

        return NO_MAILBOX_EVIDENCE
    }

    async probe(organizationId: string, email: string): Promise<MailboxProbeResult> {
        const [, domain] = email.split('@')

        const getExchangesParams: GetExchangesParams = { domain }
        const getSmtpClientParams: GetSmtpClientParams = { exchanges: [] }

        const cachedResult = await this.smtpVerificationStore.findByAddress(organizationId, email)
        const cachedEvidence = SmtpMailboxProbe.deriveStoredEvidence(cachedResult, this.clock.now())

        if (cachedResult !== null && cachedEvidence.kind !== 'none') {
            const { id: cachedEmail, targetExchange, reason } = cachedResult

            return {
                email: cachedEmail,
                exists: cachedEvidence.kind === 'smtp_recipient_accepted',
                targetExchange,
                reason,
                evidence: cachedEvidence,
            }
        }

        if (SmtpMailboxProbe.isTemporarilyBlocked(cachedResult)) {
            const { proxyId, targetExchange } = cachedResult

            getExchangesParams.targetExchange = targetExchange
            getSmtpClientParams.proxyId = proxyId
        }

        getSmtpClientParams.exchanges = await this.getExchanges(getExchangesParams)
        if (getSmtpClientParams.exchanges.length === 0) {
            // An empty resolver result means no usable records, not authoritative mailbox absence.
            return {
                email,
                exists: null,
                reason: SmtpVerificationReason.NoMxRecords,
                evidence: NO_MAILBOX_EVIDENCE,
            }
        }

        const { leasedClient, attemptedConnection } = await this.getSmtpClient(getSmtpClientParams)
        if (leasedClient == null) {
            return {
                email,
                exists: null,
                reason: attemptedConnection ? SmtpVerificationReason.NoConnect : SmtpVerificationReason.Unknown,
                evidence: NO_MAILBOX_EVIDENCE,
            }
        }

        let result: MailboxProbeResult
        try {
            result = await this.tryVerify({ client: leasedClient.client, email })
        } finally {
            await this.releaseAllocation(leasedClient.allocation)
        }

        const update: SmtpVerificationUpdate = {
            reason: result.reason,
            exists: result.exists,
            targetExchange: result.targetExchange,
            proxyId: result.proxyId,
            secureTransport: leasedClient.client.secureTransport,
            evidenceObservedAt: result.evidence.kind === 'none' ? null : result.evidence.observedAt,
            evidencePolicyVersion: result.evidence.kind === 'none' ? null : result.evidence.policyVersion,
        }
        await this.smtpVerificationStore.upsert(organizationId, email, update)

        return result
    }

    private async handleSmtpError(error: SmtpException): Promise<Omit<MailboxProbeResult, 'email' | 'evidence'>> {
        const strategy = SmtpMailboxProbe.smtpErrorHandlingStrategies.find(([predicate]) => predicate(error))
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
        const exchanges = await this.mxResolver.resolve(domain)
        return targetExchange != null ? exchanges.filter(exchange => exchange === targetExchange) : exchanges
    }

    private async tryVerify({ client, email }: TryVerifyParams): Promise<MailboxProbeResult> {
        const { hostname, exchange: targetExchange } = client

        try {
            const [clientHostname] = isIP(hostname) !== 0 ? await this.dnsService.resolve(hostname, 'PTR') : [hostname]

            await client.startSession(clientHostname)

            const clientDomain = getDomain(clientHostname)

            ok(clientDomain !== null, new Error('smtp_client_domain_invalid'))

            const senderUsername = 'contact'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)

            let exists: boolean
            let evidence: MailboxEvidence

            try {
                const response = await client.rcptTo(email)
                exists = true
                evidence = deriveMailboxEvidence({
                    stage: 'rcpt_to',
                    code: response.code,
                    enhancedCode: response.enhancedCode,
                    verifiedTransport: client.secureTransport,
                    senderAccepted: true,
                    observedAt: this.clock.now(),
                    origin: 'fresh',
                })
            } catch (error) {
                if (!(error instanceof SmtpException) || error.commandKind !== 'rcpt_to') throw error

                const candidateEvidence = deriveMailboxEvidence({
                    stage: 'rcpt_to',
                    code: error.code,
                    enhancedCode: error.enhancedCode,
                    verifiedTransport: client.secureTransport,
                    senderAccepted: true,
                    observedAt: this.clock.now(),
                    origin: 'fresh',
                })
                // Not the exact missing-recipient evidence rule (e.g. a different enhanced status): fall through
                // to generic classification below, which treats it as ineligible rather than conclusive.
                if (candidateEvidence.kind !== 'smtp_recipient_missing') throw error

                exists = false
                evidence = candidateEvidence
            }

            // A recipient answer is already decided: a later QUIT rejection or peer close must not erase it.
            await this.tryQuit(client)

            return {
                email,
                exists,
                reason: exists ? SmtpVerificationReason.AcceptedEmail : SmtpVerificationReason.RejectedEmail,
                targetExchange,
                evidence,
            }
        } catch (error) {
            if (error instanceof SmtpSecureTransportUnavailableException) {
                return {
                    email,
                    exists: null,
                    reason: SmtpVerificationReason.SecureTransportUnavailable,
                    targetExchange,
                    evidence: NO_MAILBOX_EVIDENCE,
                }
            }

            if (error instanceof SmtpException) {
                const result = await this.handleSmtpError(error)
                return { ...result, email, evidence: NO_MAILBOX_EVIDENCE }
            }

            return {
                email,
                exists: null,
                reason: SmtpVerificationReason.UnexpectedError,
                evidence: NO_MAILBOX_EVIDENCE,
            }
        } finally {
            client.end()
        }
    }

    private async tryQuit(client: ISmtpClient): Promise<void> {
        try {
            await client.quit()
        } catch {
            // Decisive recipient evidence has already been captured; never let cleanup override it.
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
            this.logger.error('smtp_connection_failed', {
                errorClass: safeErrorType(error),
            })
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

            ok(isNativeError(error), new Error('smtp_connection_error_invalid'))

            if (error instanceof SmtpException) {
                await this.handleSmtpError(error)
            }

            throw error
        }
    }
}
