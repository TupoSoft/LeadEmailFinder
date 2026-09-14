import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { ReadOutcome } from '../../operations/verification-operations-reader'
import { VerificationRequestRecord } from '../../ports/verification-request-store'
import { VerificationResultDetail } from '../../verification-result-reader'
import { mapAsyncVerificationStatus } from './async-verification-status'

const organizationId = '10000000-0000-4000-8000-000000000001'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function request(overrides: Partial<VerificationRequestRecord> = {}): VerificationRequestRecord {
    return {
        requestId: 'request-1',
        organizationId,
        normalizedAddress: 'person@lef.test',
        deliveryMode: 'async',
        clientRequestKey: null,
        executionId: null,
        resultId: null,
        source: 'fresh',
        billingState: 'settled',
        reservedCount: 1,
        chargedCount: 1,
        finalReason: 'conclusive',
        createdAt: new Date(),
        settledAt: new Date(),
        ...overrides,
    }
}

function result(overrides: Partial<VerificationResultDetail> = {}): VerificationResultDetail {
    return {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'person@lef.test',
        localPart: 'person',
        domain: 'lef.test',
        exists: true,
        catchAll: null,
        reason: EmailVerificationReason.AcceptedEmail,
        sources: [EmailVerificationSource.MX],
        createdAt: new Date('2026-09-07T00:00:00.000Z'),
        evidenceObservedAt: new Date('2026-09-07T00:00:00.000Z'),
        ...overrides,
    }
}

describe('mapAsyncVerificationStatus', () => {
    it.each([
        ['funding_pending', 'queued'],
        ['queued', 'queued'],
        ['awaiting_retry', 'queued'],
        ['running', 'running'],
        ['settling', 'running'],
    ] as const)('maps execution state %s to public state %s', (executionState, expected) => {
        const outcome: ReadOutcome = { kind: 'pending', executionState }
        expect(mapAsyncVerificationStatus(outcome, CACHE_TTL_MS)).toEqual({ state: expected })
    })

    it.each(['not-found', 'expired'] as const)('reports unavailable for %s (the caller handles the 404)', kind => {
        expect(mapAsyncVerificationStatus({ kind }, CACHE_TTL_MS)).toEqual({ state: 'unavailable' })
    })

    it('exposes a completed result with operation metadata, stripping evidence/createdAt from the result itself', () => {
        const settledRequest = request()
        const settledResult = result()
        const status = mapAsyncVerificationStatus({ kind: 'settled', request: settledRequest, result: settledResult }, CACHE_TTL_MS)

        expect(status).toEqual({
            state: 'completed',
            result: {
                id: settledResult.id,
                email: settledResult.email,
                localPart: settledResult.localPart,
                domain: settledResult.domain,
                exists: true,
                catchAll: null,
                reason: EmailVerificationReason.AcceptedEmail,
                sources: [EmailVerificationSource.MX],
            },
            operation: {
                id: 'request-1',
                source: 'fresh',
                observedAt: settledResult.evidenceObservedAt!.toISOString(),
                cacheExpiresAt: new Date(settledResult.evidenceObservedAt!.getTime() + CACHE_TTL_MS).toISOString(),
                billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
            },
        })
        expect(status).not.toHaveProperty('result.evidenceObservedAt')
        expect(status).not.toHaveProperty('result.createdAt')
    })

    it('preserves optional format/mxDomain/targetExchange only when present', () => {
        const status = mapAsyncVerificationStatus(
            {
                kind: 'settled',
                request: request(),
                result: result({ mxDomain: 'lef.test', targetExchange: 'mx.lef.test' }),
            },
            CACHE_TTL_MS,
        )
        expect(status).toMatchObject({ result: { mxDomain: 'lef.test', targetExchange: 'mx.lef.test' } })
    })

    it('reports failed with operation metadata for a settled request with no result', () => {
        const settledRequest = request({ resultId: null, chargedCount: 0, finalReason: 'failed' })
        const status = mapAsyncVerificationStatus({ kind: 'settled', request: settledRequest, result: null }, CACHE_TTL_MS)

        expect(status).toEqual({
            state: 'failed',
            failureCode: 'verification_failed',
            operation: {
                id: 'request-1',
                source: 'fresh',
                observedAt: null,
                cacheExpiresAt: null,
                billing: { state: 'settled', reserved: 1, charged: 0, reason: 'failed' },
            },
        })
    })
})
