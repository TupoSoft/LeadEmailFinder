import { isRequestOriginAllowed, parseAllowedOrigins } from './request-origin.js'

describe('parseAllowedOrigins', () => {
    it.each([
        ['an unset value', undefined, []],
        ['a blank value', '   ', []],
        ['a single origin', 'https://client.example', ['https://client.example']],
        ['surrounding whitespace around each entry', '  https://client.example ,  http://localhost:4100  ', ['https://client.example', 'http://localhost:4100']],
        ['duplicate entries collapsed to one', 'https://client.example,https://client.example', ['https://client.example']],
    ])('accepts %s', (_description, raw, expected) => {
        expect([...parseAllowedOrigins(raw)]).toEqual(expected)
    })

    it.each([
        ['a wildcard', '*'],
        ['the opaque origin null', 'null'],
        ['a trailing slash', 'https://client.example/'],
        ['an explicit default port', 'https://client.example:443'],
        ['a path', 'https://client.example/foo'],
        ['a query string', 'https://client.example?x=1'],
        ['embedded credentials', 'https://user:pass@client.example'],
        ['a non-HTTP scheme', 'ftp://client.example'],
        ['an empty entry between commas', 'https://client.example,,http://localhost:4100'],
        ['an entry that is only whitespace', 'https://client.example, ,http://localhost:4100'],
        ['plain unparsable text', 'not-a-url'],
    ])('rejects %s', (_description, raw) => {
        expect(() => parseAllowedOrigins(raw)).toThrow()
    })
})

describe('isRequestOriginAllowed', () => {
    const allowed = new Set(['https://client.example'])

    it('allows a request with no Origin header at all', () => {
        expect(isRequestOriginAllowed(['Host', 'localhost'], allowed)).toBe(true)
    })

    it('allows a request whose Origin header matches the allowlist exactly', () => {
        expect(isRequestOriginAllowed(['Origin', 'https://client.example'], allowed)).toBe(true)
    })

    it('rejects an Origin header absent from the allowlist', () => {
        expect(isRequestOriginAllowed(['Origin', 'https://untrusted.example'], allowed)).toBe(false)
    })

    it('rejects a mismatched port even when the host is allowed', () => {
        expect(isRequestOriginAllowed(['Origin', 'https://client.example:8443'], allowed)).toBe(false)
    })

    it('rejects an empty Origin header value', () => {
        expect(isRequestOriginAllowed(['Origin', ''], allowed)).toBe(false)
    })

    it('rejects the opaque origin null', () => {
        expect(isRequestOriginAllowed(['Origin', 'null'], allowed)).toBe(false)
    })

    it('rejects a malformed Origin header value', () => {
        expect(isRequestOriginAllowed(['Origin', 'not-a-url'], allowed)).toBe(false)
    })

    it('rejects a single Origin header containing comma-separated values', () => {
        expect(isRequestOriginAllowed(['Origin', 'https://client.example,https://untrusted.example'], allowed)).toBe(false)
    })

    it('rejects duplicate Origin headers even when every value is allowed', () => {
        expect(
            isRequestOriginAllowed(['Origin', 'https://client.example', 'Origin', 'https://client.example'], allowed),
        ).toBe(false)
    })

    it('rejects duplicate Origin headers regardless of the capitalization each occurrence used', () => {
        expect(
            isRequestOriginAllowed(['Origin', 'https://client.example', 'ORIGIN', 'https://client.example'], allowed),
        ).toBe(false)
    })

    it('never trusts an origin when the allowlist is empty, even a well-formed one', () => {
        expect(isRequestOriginAllowed(['Origin', 'https://client.example'], new Set())).toBe(false)
    })
})
