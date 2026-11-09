import {
    checkVerificationIdempotencyKeyAge,
    decodeVerificationIdempotencyKey,
    VERIFICATION_REQUEST_KEY_MAX_AGE_MS,
    VERIFICATION_REQUEST_KEY_MAX_AHEAD_MS,
} from './verification-idempotency-key'

function buildUuidV7(timestampMs: number): string {
    const timestampHex = timestampMs.toString(16).padStart(12, '0')
    return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
}

describe('decodeVerificationIdempotencyKey', () => {
    it('decodes the embedded millisecond timestamp from a canonical lowercase UUIDv7', () => {
        const timestampMs = Date.parse('2026-09-08T00:00:00.000Z')
        expect(decodeVerificationIdempotencyKey(buildUuidV7(timestampMs))).toEqual(new Date(timestampMs))
    })

    it('rejects a non-UUIDv7 version nibble', () => {
        expect(decodeVerificationIdempotencyKey('00000000-0000-4000-8000-000000000000')).toBeNull()
    })

    it('rejects uppercase, malformed, or non-UUID strings', () => {
        expect(decodeVerificationIdempotencyKey('0123456a-0000-7000-8000-000000000000'.toUpperCase())).toBeNull()
        expect(decodeVerificationIdempotencyKey('not-a-uuid')).toBeNull()
        expect(decodeVerificationIdempotencyKey('')).toBeNull()
    })
})

describe('checkVerificationIdempotencyKeyAge', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')

    it('is valid exactly at the embedded moment', () => {
        expect(checkVerificationIdempotencyKeyAge(buildUuidV7(now.getTime()), now)).toBe('valid')
    })

    it('is valid strictly within the 24-hour age bound', () => {
        const key = buildUuidV7(now.getTime() - VERIFICATION_REQUEST_KEY_MAX_AGE_MS + 1)
        expect(checkVerificationIdempotencyKeyAge(key, now)).toBe('valid')
    })

    it('is expired at and beyond the 24-hour age bound', () => {
        const atBound = buildUuidV7(now.getTime() - VERIFICATION_REQUEST_KEY_MAX_AGE_MS)
        expect(checkVerificationIdempotencyKeyAge(atBound, now)).toBe('valid')
        const pastBound = buildUuidV7(now.getTime() - VERIFICATION_REQUEST_KEY_MAX_AGE_MS - 1)
        expect(checkVerificationIdempotencyKeyAge(pastBound, now)).toBe('expired')
    })

    it('is valid strictly within the 5-minute ahead bound', () => {
        const key = buildUuidV7(now.getTime() + VERIFICATION_REQUEST_KEY_MAX_AHEAD_MS - 1)
        expect(checkVerificationIdempotencyKeyAge(key, now)).toBe('valid')
    })

    it('is too-far-ahead beyond the 5-minute ahead bound', () => {
        const key = buildUuidV7(now.getTime() + VERIFICATION_REQUEST_KEY_MAX_AHEAD_MS + 1)
        expect(checkVerificationIdempotencyKeyAge(key, now)).toBe('too-far-ahead')
    })

    it('is malformed for anything that does not decode', () => {
        expect(checkVerificationIdempotencyKeyAge('not-a-uuid', now)).toBe('malformed')
    })
})
