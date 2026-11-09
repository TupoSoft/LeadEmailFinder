import { isCachedResultUsable } from './verification-result-cache'

const observedAt = new Date('2026-09-08T00:00:00.000Z')
const cacheTtlMs = 24 * 60 * 60 * 1000

function record(
    overrides: Partial<Parameters<typeof isCachedResultUsable>[0]> = {},
): Parameters<typeof isCachedResultUsable>[0] {
    return {
        verificationQuality: 'conclusive_positive',
        evidenceObservedAt: observedAt,
        evidencePolicyVersion: 1,
        ...overrides,
    }
}

describe('isCachedResultUsable', () => {
    it('is usable strictly within the TTL', () => {
        const now = new Date(observedAt.getTime() + cacheTtlMs - 1)
        expect(isCachedResultUsable(record(), now, cacheTtlMs)).toBe(true)
    })

    it('is unusable at the exact TTL boundary', () => {
        const now = new Date(observedAt.getTime() + cacheTtlMs)
        expect(isCachedResultUsable(record(), now, cacheTtlMs)).toBe(false)
    })

    it('is unusable for an inconclusive result regardless of freshness', () => {
        const now = new Date(observedAt.getTime())
        expect(isCachedResultUsable(record({ verificationQuality: 'inconclusive' }), now, cacheTtlMs)).toBe(false)
    })

    it('is unusable for a conclusive_negative or conclusive_positive result at a mismatched policy version', () => {
        const now = new Date(observedAt.getTime())
        expect(isCachedResultUsable(record({ evidencePolicyVersion: 2 }), now, cacheTtlMs)).toBe(false)
    })

    it('is unusable when no observation time was ever recorded', () => {
        const now = new Date(observedAt.getTime())
        expect(isCachedResultUsable(record({ evidenceObservedAt: null }), now, cacheTtlMs)).toBe(false)
    })

    it('is usable immediately at observation time itself', () => {
        expect(isCachedResultUsable(record(), observedAt, cacheTtlMs)).toBe(true)
    })

    it('respects a configured TTL shorter than the default', () => {
        const shortTtlMs = 60_000
        const now = new Date(observedAt.getTime() + shortTtlMs)
        expect(isCachedResultUsable(record(), now, shortTtlMs)).toBe(false)
        expect(isCachedResultUsable(record(), new Date(now.getTime() - 1), shortTtlMs)).toBe(true)
    })
})
