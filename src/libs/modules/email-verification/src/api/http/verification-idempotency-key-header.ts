import { checkVerificationIdempotencyKeyAge } from '../../application/verification-idempotency-key'

export type IdempotencyKeyHeaderOutcome =
    | { readonly kind: 'absent' }
    | { readonly kind: 'valid'; readonly key: string }
    | { readonly kind: 'malformed' }
    | { readonly kind: 'too-far-ahead' }

/** Parses an optional `Idempotency-Key` header from Express's `req.rawHeaders` (not `req.headers`, which would
 *  silently merge a repeated header) into a canonical lowercase UUIDv7. Never imports credits' own private
 *  parser — this module owns its own idempotency-key vocabulary (UUIDv7-specific, unlike credits' any-version-UUID
 *  check).
 *
 *  Deliberately does not reject an old key as expired here: an existing stored request must be looked up and
 *  replayed by its own fields first (never re-aged), and only admission's `VerificationAdmissionService.admit()`
 *  knows whether a matching request already exists. A future-dated key can never have an existing stored request
 *  (admission always ages a first-seen key against its own current time), so rejecting it immediately as
 *  `too-far-ahead` loses no legitimate replay. */
export function parseVerificationIdempotencyKeyHeader(
    rawHeaders: readonly string[],
    now: Date = new Date(),
): IdempotencyKeyHeaderOutcome {
    const values: string[] = []
    for (let index = 0; index < rawHeaders.length; index += 2) {
        if (rawHeaders[index].toLowerCase() === 'idempotency-key') values.push(rawHeaders[index + 1])
    }

    if (values.length === 0) return { kind: 'absent' }
    if (values.length > 1) return { kind: 'malformed' }

    const key = values[0]
    if (key !== key.toLowerCase()) return { kind: 'malformed' }

    const age = checkVerificationIdempotencyKeyAge(key, now)
    if (age === 'malformed') return { kind: 'malformed' }
    if (age === 'too-far-ahead') return { kind: 'too-far-ahead' }
    return { kind: 'valid', key }
}
