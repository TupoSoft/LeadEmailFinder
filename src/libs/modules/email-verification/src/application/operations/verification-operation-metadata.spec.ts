import { VerificationRequestRecord } from '../ports/verification-request-store'
import { buildOperationMetadata } from './verification-operation-metadata'

const organizationId = '10000000-0000-4000-8000-000000000001'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function request(overrides: Partial<VerificationRequestRecord> = {}): VerificationRequestRecord {
    return {
        requestId: 'request-1',
        organizationId,
        normalizedAddress: 'person@example.test',
        deliveryMode: 'sync',
        clientRequestKey: null,
        executionId: null,
        resultId: null,
        source: 'fresh',
        billingState: 'pending',
        reservedCount: 1,
        chargedCount: 0,
        finalReason: null,
        createdAt: new Date(),
        settledAt: null,
        ...overrides,
    }
}

describe('buildOperationMetadata', () => {
    it('omits the billing reason and cache expiry while pending', () => {
        const metadata = buildOperationMetadata(request(), null, CACHE_TTL_MS)
        expect(metadata.id).toBe('request-1')
        expect(metadata.source).toBe('fresh')
        expect(metadata.observedAt).toBeNull()
        expect(metadata.cacheExpiresAt).toBeNull()
        expect(metadata.billing).toEqual({ state: 'pending', reserved: 1, charged: 0 })
        expect(metadata.billing.reason).toBeUndefined()
    })

    it('exposes the billing reason once settled', () => {
        const observedAt = new Date('2026-09-13T00:00:00.000Z')
        const metadata = buildOperationMetadata(
            request({ billingState: 'settled', chargedCount: 1, finalReason: 'conclusive', settledAt: observedAt }),
            observedAt,
            CACHE_TTL_MS,
        )
        expect(metadata.billing).toEqual({ state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' })
        expect(metadata.observedAt).toBe(observedAt.toISOString())
    })

    it('computes cache expiry only for a conclusive final reason', () => {
        const observedAt = new Date('2026-09-13T00:00:00.000Z')
        const metadata = buildOperationMetadata(
            request({ billingState: 'settled', finalReason: 'conclusive' }),
            observedAt,
            CACHE_TTL_MS,
        )
        expect(metadata.cacheExpiresAt).toBe(new Date(observedAt.getTime() + CACHE_TTL_MS).toISOString())
    })

    it('never computes cache expiry for a non-conclusive final reason', () => {
        const observedAt = new Date('2026-09-13T00:00:00.000Z')
        const metadata = buildOperationMetadata(
            request({ billingState: 'settled', finalReason: 'inconclusive' }),
            observedAt,
            CACHE_TTL_MS,
        )
        expect(metadata.cacheExpiresAt).toBeNull()
    })

    it('never computes cache expiry with no evidence observation time', () => {
        const metadata = buildOperationMetadata(
            request({ billingState: 'settled', finalReason: 'conclusive' }),
            null,
            CACHE_TTL_MS,
        )
        expect(metadata.cacheExpiresAt).toBeNull()
    })
})
