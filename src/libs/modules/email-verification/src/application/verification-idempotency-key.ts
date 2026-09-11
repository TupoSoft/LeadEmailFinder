export const VERIFICATION_REQUEST_KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const VERIFICATION_REQUEST_KEY_MAX_AHEAD_MS = 5 * 60 * 1000

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A UUIDv7's first 48 bits are a big-endian Unix millisecond timestamp — the first 8 hex characters plus the
 *  next 4 (skipping the hyphen). Returns null for anything that is not a canonical lowercase UUIDv7. */
export function decodeVerificationIdempotencyKey(key: string): Date | null {
    if (!UUID_V7_PATTERN.test(key)) return null

    const timestampHex = key.slice(0, 8) + key.slice(9, 13)
    const timestampMs = parseInt(timestampHex, 16)
    return Number.isSafeInteger(timestampMs) ? new Date(timestampMs) : null
}

export type VerificationIdempotencyKeyAge = 'valid' | 'expired' | 'too-far-ahead' | 'malformed'

/** Only used for first admission of a key with no existing request row: an existing row is looked up and
 *  replayed by its own stored fields, never re-aged. */
export function checkVerificationIdempotencyKeyAge(
    key: string,
    now: Date,
    maxAgeMs: number = VERIFICATION_REQUEST_KEY_MAX_AGE_MS,
    maxAheadMs: number = VERIFICATION_REQUEST_KEY_MAX_AHEAD_MS,
): VerificationIdempotencyKeyAge {
    const embeddedAt = decodeVerificationIdempotencyKey(key)
    if (embeddedAt === null) return 'malformed'

    const deltaMs = now.getTime() - embeddedAt.getTime()
    if (deltaMs < -maxAheadMs) return 'too-far-ahead'
    if (deltaMs > maxAgeMs) return 'expired'
    return 'valid'
}
