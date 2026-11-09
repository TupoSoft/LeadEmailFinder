import { firstHeaderValue, parseCookieHeader, readPresentedCookie } from './parse-cookie-header'

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

    it('ignores malformed encoded fragments without losing valid cookies', () => {
        expect(parseCookieHeader('junk=%; lef_login_state=valid-state')).toEqual({
            lef_login_state: 'valid-state',
        })
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

describe('readPresentedCookie', () => {
    it.each([undefined, '', 'unrelated=value'])('distinguishes an absent session cookie (%p)', header => {
        expect(readPresentedCookie(header, 'lef_session')).toBeUndefined()
    })
    it.each(['lef_session=%', 'lef_session=', 'lef_session', 'lef_session=one; lef_session=two'])(
        'preserves an unusable cookie as present (%p)',
        header => {
            expect(readPresentedCookie(header, 'lef_session')).toBe('')
        },
    )
    it('retains a valid decoded cookie', () => {
        expect(readPresentedCookie('junk=%; lef_session=valid%2Dsession', 'lef_session')).toBe('valid-session')
    })
})
