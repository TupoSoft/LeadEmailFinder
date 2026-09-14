import { parseVerificationIdempotencyKeyHeader } from './verification-idempotency-key-header'

const now = new Date('2026-09-13T00:00:00.000Z')

function buildUuidV7(timestampMs: number): string {
    const timestampHex = timestampMs.toString(16).padStart(12, '0')
    return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
}

describe('parseVerificationIdempotencyKeyHeader', () => {
    it('reports absent when no header is present', () => {
        expect(parseVerificationIdempotencyKeyHeader(['host', 'example.test'], now)).toEqual({ kind: 'absent' })
    })

    it('accepts a canonical lowercase UUIDv7 within age bounds', () => {
        const key = buildUuidV7(now.getTime())
        expect(parseVerificationIdempotencyKeyHeader(['Idempotency-Key', key], now)).toEqual({ kind: 'valid', key })
    })

    it('rejects a repeated header', () => {
        const key = buildUuidV7(now.getTime())
        expect(
            parseVerificationIdempotencyKeyHeader(['Idempotency-Key', key, 'Idempotency-Key', key], now),
        ).toEqual({ kind: 'malformed' })
    })

    it('rejects an uppercase key', () => {
        const key = buildUuidV7(now.getTime())
        expect(parseVerificationIdempotencyKeyHeader(['Idempotency-Key', key.toUpperCase()], now)).toEqual({
            kind: 'malformed',
        })
    })

    it('rejects a non-UUIDv7 shape', () => {
        expect(parseVerificationIdempotencyKeyHeader(['Idempotency-Key', 'not-a-uuid'], now)).toEqual({
            kind: 'malformed',
        })
    })

    it('rejects a key more than 5 minutes ahead of server time', () => {
        const key = buildUuidV7(now.getTime() + 5 * 60 * 1000 + 1)
        expect(parseVerificationIdempotencyKeyHeader(['Idempotency-Key', key], now)).toEqual({
            kind: 'too-far-ahead',
        })
    })

    it('passes an old key through as valid, deferring the expiry decision to admission\'s own stored-request lookup', () => {
        const key = buildUuidV7(now.getTime() - 24 * 60 * 60 * 1000 - 1)
        expect(parseVerificationIdempotencyKeyHeader(['Idempotency-Key', key], now)).toEqual({ kind: 'valid', key })
    })

    it('matches the header name case-insensitively', () => {
        const key = buildUuidV7(now.getTime())
        expect(parseVerificationIdempotencyKeyHeader(['IDEMPOTENCY-KEY', key], now)).toEqual({ kind: 'valid', key })
    })
})
