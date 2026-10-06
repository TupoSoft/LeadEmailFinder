import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVerificationRequestKey } from './verification-request-key'

afterEach(() => vi.restoreAllMocks())

describe('verification request keys', () => {
    it.each([0, 1, Date.parse('2026-09-16T12:00:00.000Z'), 0xffffffffffff])(
        'encodes the exact millisecond clock %s in canonical UUIDv7 format',
        now => {
            const key = createVerificationRequestKey(now)
            expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
            expect(Number.parseInt(key.replaceAll('-', '').slice(0, 12), 16)).toBe(now)
        },
    )
    it('uses cryptographic bytes while setting only clock, version, and variant bits', () => {
        const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            ;(array as Uint8Array).fill(0xff)
            return array
        })
        expect(createVerificationRequestKey(0)).toBe('00000000-0000-7fff-bfff-ffffffffffff')
        expect(random).toHaveBeenCalledOnce()
    })
    it('does not reuse random bits for submissions within the same millisecond or after clock rollback', () => {
        const now = Date.now()
        const keys = [
            createVerificationRequestKey(now),
            createVerificationRequestKey(now),
            createVerificationRequestKey(now - 1),
        ]
        expect(new Set(keys).size).toBe(3)
    })
    it.each([-1, 1.5, Infinity, 0x1000000000000])('rejects an unrepresentable timestamp %s', now => {
        expect(() => createVerificationRequestKey(now)).toThrow(RangeError)
    })
})
