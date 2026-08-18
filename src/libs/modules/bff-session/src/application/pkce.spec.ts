import {
    computeCodeChallengeS256,
    generateCodeVerifier,
    generateCsrfToken,
    generateNonce,
    generateSessionId,
    generateState,
} from './pkce'

describe('pkce', () => {
    it('computes the S256 code challenge per RFC 7636 appendix B', () => {
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

        expect(computeCodeChallengeS256(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    })

    it.each([
        ['generateState', generateState],
        ['generateNonce', generateNonce],
        ['generateCodeVerifier', generateCodeVerifier],
        ['generateSessionId', generateSessionId],
        ['generateCsrfToken', generateCsrfToken],
    ])('%s produces unique, url-safe values with no padding', (_name, generator: () => string) => {
        const first = generator()
        const second = generator()

        expect(first).not.toBe(second)
        expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(first.length).toBeGreaterThan(16)
    })
})
