// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertTotpSecret, generateTotp } from './totp.ts'

// Public SHA-1 test key from RFC 6238, Appendix B; outputs reduced to six digits.
const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('browser fixture TOTP', () => {
    it.each([
        [59, '287082'],
        [1_111_111_109, '081804'],
        [1_111_111_111, '050471'],
        [1_234_567_890, '005924'],
        [2_000_000_000, '279037'],
        [20_000_000_000, '353130'],
    ])('matches the published SHA-1 vector at %i seconds', (seconds, expected) => {
        expect(generateTotp(rfcSecret, seconds * 1000)).toBe(expected)
    })

    it('changes only on an exact thirty-second boundary', () => {
        expect(generateTotp(rfcSecret, 0)).toBe('755224')
        expect(generateTotp(rfcSecret, 29_999)).toBe('755224')
        expect(generateTotp(rfcSecret, 30_000)).toBe('287082')
        expect(generateTotp(rfcSecret, 59_999)).toBe('287082')
        expect(generateTotp(rfcSecret, 60_000)).toBe('359152')
    })

    it.each(['MY', 'MZXQ', 'MZXW6', 'MZXW6YQ', 'MZXW6YTB'])('accepts canonical unpadded Base32 %s', secret => {
        expect(() => assertTotpSecret(secret)).not.toThrow()
    })

    it.each([
        '',
        'M',
        'MZX',
        'MZXW6Y',
        'MZ',
        'MZXR',
        'MZXW7',
        'MZXW6YR',
        'my',
        'MY======',
        'M Y',
        ' MY',
        'MY\n',
        'M1',
        'M0',
        'M8',
        'МY',
        'A'.repeat(1025),
        null,
    ])('rejects malformed or noncanonical input case %# without disclosing it', secret => {
        expect(() => assertTotpSecret(secret)).toThrow('Invalid browser fixture TOTP configuration.')
    })

    it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid explicit clock %#', clock => {
        expect(() => generateTotp(rfcSecret, clock)).toThrow('Invalid browser fixture TOTP clock.')
    })
})
