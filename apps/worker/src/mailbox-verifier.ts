import { DnsService, IDnsService } from './libs/dns/src'
import { LRUCache } from 'lru-cache'
import { getDomain } from 'tldts'
import {
    CompletedVerificationResult,
    deriveMailboxEvidence,
    MailboxEvidence,
    NO_MAILBOX_EVIDENCE,
    serializeMailboxEvidence,
    VerificationCommand,
    VerificationResult,
} from '@tuposoft/lead-email-finder-verification-contracts'
import type { AccountDiscovery } from './application/ports/account-discovery'
import { isPublicDestination } from './public-destination'
import { SmtpIdentity, SmtpObservation, SmtpReplyError, SmtpSession } from './smtp-session'

interface ProbeResult {
    evidence: MailboxEvidence
    exists: boolean | null
    reason: CompletedVerificationResult['reason']
    exchange?: string
}

interface CacheEntry {
    observedAt: number
    result: ProbeResult
}

const FRESHNESS_MS = 24 * 60 * 60 * 1000
const CONTROL_LOCAL_PART = 'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak'

export class MailboxVerifier {
    private readonly cache = new LRUCache<string, CacheEntry>({
        max: 10_000,
        ttl: FRESHNESS_MS,
    })

    constructor(
        private readonly identity: SmtpIdentity,
        private readonly dns: IDnsService = new DnsService(),
        private readonly discovery?: AccountDiscovery,
    ) {}

    async verify(command: VerificationCommand, signal: AbortSignal): Promise<VerificationResult> {
        const identity = {
            version: 1 as const,
            executionId: command.executionId,
            organizationId: command.organizationId,
            attemptId: command.attemptId,
        }
        const domain = command.email.slice(command.email.lastIndexOf('@') + 1)

        signal.throwIfAborted()

        const control = await this.probe(command.organizationId, `${CONTROL_LOCAL_PART}@${domain}`, signal)
        let target: ProbeResult = {
            evidence: NO_MAILBOX_EVIDENCE,
            exists: null,
            reason: control.reason,
            exchange: control.exchange,
        }
        if (control.evidence.kind === 'smtp_recipient_missing') {
            target = await this.probe(command.organizationId, command.email, signal)
        }

        if (target.reason === 'temporarily_blocked' || control.reason === 'temporarily_blocked') {
            return {
                ...identity,
                outcome: 'retryable-failure',
                failureReason: 'temporarily_blocked',
            }
        }

        let sources: CompletedVerificationResult['sources'] = target.evidence.kind !== 'none' ? ['mx'] : []
        let reason = target.reason
        let exists = target.exists

        if (
            this.discovery &&
            target.evidence.kind === 'none' &&
            (control.exists === true || target.reason === 'blacklisted')
        ) {
            const discovered = await this.discovery.discover(command.email)
            const allowed = new Set(['microsoft_1', 'microsoft_2', 'microsoft_4', 'mimecast'])
            sources = discovered
                .map(value => value.sourceName)
                .filter((source): source is CompletedVerificationResult['sources'][number] => allowed.has(source))

            if (sources.length) {
                exists = true
                reason = 'webmail'
            }
        }

        signal.throwIfAborted()

        const exchange = target.exchange ?? control.exchange
        const mxDomain = exchange ? getDomain(exchange) : null

        return {
            ...identity,
            outcome: 'completed',
            result: {
                exists,
                catchAll: control.exists,
                reason,
                sources,
                ...(exchange ? { targetExchange: exchange } : {}),
                ...(mxDomain ? { mxDomain } : {}),
                targetEvidence: serializeMailboxEvidence(target.evidence),
                controlEvidence: serializeMailboxEvidence(control.evidence),
            },
        }
    }

    private async probe(organizationId: string, email: string, signal: AbortSignal): Promise<ProbeResult> {
        const key = `${organizationId}\0${email}\0v1`
        const cached = this.cache.get(key)
        const now = Date.now()

        // Evidence age is authoritative even when the cache's monotonic clock differs.
        if (cached && cached.observedAt <= now && now - cached.observedAt < FRESHNESS_MS) {
            let evidence: MailboxEvidence = NO_MAILBOX_EVIDENCE
            if (cached.result.evidence.kind !== 'none') {
                evidence = { ...cached.result.evidence, origin: 'stored' }
            }

            return {
                ...cached.result,
                evidence,
            }
        }

        if (cached) {
            this.cache.delete(key)
        }

        const domain = email.slice(email.lastIndexOf('@') + 1)
        const exchanges = await this.dns.resolve(domain, 'MX', signal)

        signal.throwIfAborted()

        if (!exchanges.length) {
            return {
                evidence: NO_MAILBOX_EVIDENCE,
                exists: null,
                reason: 'no_mx_records',
            }
        }

        let last: ProbeResult = {
            evidence: NO_MAILBOX_EVIDENCE,
            exists: null,
            reason: 'no_connect',
        }

        for (const { exchange } of exchanges.sort((a, b) => a.priority - b.priority)) {
            if (!exchange || exchange === '.') {
                continue
            }

            const resolved = await Promise.allSettled([
                this.dns.resolve(exchange, 'A', signal),
                this.dns.resolve(exchange, 'AAAA', signal),
            ])

            signal.throwIfAborted()

            const addresses = resolved
                .flatMap(value => (value.status === 'fulfilled' ? value.value : []))
                .filter(isPublicDestination)

            for (const address of addresses) {
                signal.throwIfAborted()

                const session = new SmtpSession(signal, this.identity)

                try {
                    const observation = await session.probe(address, exchange, email)
                    last = this.fromObservation(observation, exchange)

                    if (last.evidence.kind !== 'none') {
                        const observedAt = last.evidence.observedAt.getTime()
                        const evidenceAgeMilliseconds = Date.now() - observedAt
                        const remainingTtl = FRESHNESS_MS - evidenceAgeMilliseconds

                        if (evidenceAgeMilliseconds >= 0 && remainingTtl > 0) {
                            this.cache.set(
                                key,
                                { observedAt, result: last },
                                { ttl: remainingTtl },
                            )
                        }
                    }

                    return last
                } catch (error) {
                    signal.throwIfAborted()

                    let reason: ProbeResult['reason'] = 'no_connect'
                    if (error instanceof SmtpReplyError) {
                        reason = error.reason
                    } else if (error instanceof Error && error.name === 'TimeoutError') {
                        reason = 'timeout'
                    }

                    last = {
                        evidence: NO_MAILBOX_EVIDENCE,
                        exists: null,
                        reason,
                        exchange,
                    }
                } finally {
                    await session.close()
                }
            }
        }

        return last
    }

    private fromObservation(observation: SmtpObservation, exchange: string): ProbeResult {
        const evidence = deriveMailboxEvidence(observation)

        if (evidence.kind === 'smtp_recipient_accepted') {
            return {
                evidence,
                exists: true,
                reason: 'accepted_email',
                exchange,
            }
        }

        if (evidence.kind === 'smtp_recipient_missing') {
            return {
                evidence,
                exists: false,
                reason: 'rejected_email',
                exchange,
            }
        }

        let reason: ProbeResult['reason'] = 'unexpected_error'
        if (observation.senderBlocked) {
            reason = 'sender_blocked'
        } else if (observation.blacklisted) {
            reason = 'blacklisted'
        } else if (observation.code === 450 || observation.code === 451) {
            reason = 'temporarily_blocked'
        } else if (observation.code === 552) {
            reason = 'exceeded_storage'
        } else if (observation.stage === 'mail_from') {
            reason = 'sender_blocked'
        }

        return {
            evidence,
            exists: null,
            reason,
            exchange,
        }
    }
}
