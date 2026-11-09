import { BadRequestException } from '@nestjs/common'
import { parseCreditIdempotencyKey } from './credit-idempotency-key'

describe('parseCreditIdempotencyKey', () => {
    const key = '841668a4-3ba2-4a6d-92a9-969bd60c5121'

    it('accepts one canonical UUID with a case-insensitive header name', () => {
        expect(parseCreditIdempotencyKey(['Content-Type', 'application/json', 'iDeMpOtEnCy-KeY', key])).toBe(key)
    })

    it.each([
        ['missing', []],
        ['empty', ['Idempotency-Key', '']],
        ['malformed', ['Idempotency-Key', 'not-a-uuid']],
        ['uppercase', ['Idempotency-Key', key.toUpperCase()]],
        ['compact', ['Idempotency-Key', key.replaceAll('-', '')]],
        ['prefixed', ['Idempotency-Key', `platform-credit-add:${key}`]],
        ['whitespace', ['Idempotency-Key', ` ${key} `]],
        ['combined', ['Idempotency-Key', `${key}, ${key}`]],
        ['repeated', ['Idempotency-Key', key, 'idempotency-key', key]],
    ])('rejects a %s key', (_name, rawHeaders) => {
        expect(() => parseCreditIdempotencyKey(rawHeaders)).toThrow(BadRequestException)
    })
})
