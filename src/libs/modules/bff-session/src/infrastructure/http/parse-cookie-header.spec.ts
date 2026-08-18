import { firstHeaderValue, parseCookieHeader } from './parse-cookie-header'

describe('parseCookieHeader', () => {
    it('returns an empty object for an undefined header', () => {
        expect(parseCookieHeader(undefined)).toEqual({})
    })

    it('parses a single cookie', () => {
        expect(parseCookieHeader('lef_session=abc123')).toEqual({ lef_session: 'abc123' })
    })

    it('parses multiple cookies separated by "; "', () => {
        expect(parseCookieHeader('lef_session=abc123; lef_csrf_token=xyz789')).toEqual({
            lef_session: 'abc123',
            lef_csrf_token: 'xyz789',
        })
    })

    it('URL-decodes cookie values', () => {
        expect(parseCookieHeader('lef_session=abc%2F123')).toEqual({ lef_session: 'abc/123' })
    })

    it('ignores a value-less cookie fragment', () => {
        expect(parseCookieHeader('flag; lef_session=abc123')).toEqual({ flag: '', lef_session: 'abc123' })
    })
})

describe('firstHeaderValue', () => {
    it('returns the value unchanged for a single string', () => {
        expect(firstHeaderValue('a')).toBe('a')
    })

    it('returns the first element for an array', () => {
        expect(firstHeaderValue(['a', 'b'])).toBe('a')
    })

    it('returns undefined unchanged', () => {
        expect(firstHeaderValue(undefined)).toBeUndefined()
    })
})
