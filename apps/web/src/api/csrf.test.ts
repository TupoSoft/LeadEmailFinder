import { describe, expect, it, vi } from 'vitest'
import { createCsrfMiddleware, readCsrfToken } from './csrf'

describe('CSRF cookie parsing', () => {
    it.each([
        ['lef_csrf_token=plain-token', 'plain-token'],
        ['theme=dark; lef_csrf_token=encoded%2Btoken%2F%3D; locale=en', 'encoded+token/='],
        [' lef_csrf_token = unencoded+token== ', 'unencoded+token=='],
        ['lef_csrf_token=first; lef_csrf_token=second', 'first'],
        ['lef_csrf_token=token%252F', 'token%2F'],
    ])('extracts and decodes only the exact cookie from %s', (cookies, expected) => {
        expect(readCsrfToken(cookies)).toBe(expected)
    })

    it.each([
        '',
        'theme=dark',
        'lef_session=unread-session',
        'lef_csrf_token',
        'lef_csrf_token=',
        'lef_csrf_token=%20',
        'prefix_lef_csrf_token=wrong; lef_csrf_token_suffix=wrong',
        'LEF_CSRF_TOKEN=wrong; lef%5Fcsrf%5Ftoken=wrong',
        'lef_csrf_token=%',
        'lef_csrf_token=%E0%A4%A',
        'lef_csrf_token=%00',
        'lef_csrf_token=token%0D%0AX-Injected%3A%20value',
        'lef_csrf_token=%E2%98%83',
        'lef_csrf_token=%; lef_csrf_token=second',
    ])('ignores missing or malformed tokens in %s', (cookies) => {
        expect(readCsrfToken(cookies)).toBeUndefined()
    })

    it('never decodes unrelated cookie values, including session material', () => {
        const decode = vi.spyOn(globalThis, 'decodeURIComponent')

        expect(readCsrfToken('lef_session=%malformed; theme=%; lef_csrf_token=csrf%2Bvalue')).toBe('csrf+value')
        expect(decode).toHaveBeenCalledExactlyOnceWith('csrf%2Bvalue')
    })
})

describe('CSRF middleware', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'patch'])('adds the decoded header for %s', (method) => {
        const readCookies = vi.fn(() => 'lef_csrf_token=csrf%2Bvalue')
        const request = new Request('https://app.example.test/v1/action', { method: method.toUpperCase() })
        Object.defineProperty(request, 'method', { value: method })

        createCsrfMiddleware(readCookies).onRequest({ request })

        expect(request.headers.get('x-csrf-token')).toBe('csrf+value')
        expect(readCookies).toHaveBeenCalledOnce()
    })

    it.each(['GET', 'HEAD', 'OPTIONS'])('does not read cookies or add a header for %s', (method) => {
        const readCookies = vi.fn(() => 'lef_csrf_token=unused')
        const request = new Request('https://app.example.test/v1/action', { method })

        createCsrfMiddleware(readCookies).onRequest({ request })

        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(readCookies).not.toHaveBeenCalled()
    })

    it.each(['caller-token', ''])('preserves an explicit caller header, including %j', (value) => {
        const readCookies = vi.fn(() => 'lef_csrf_token=unused')
        const request = new Request('https://app.example.test/v1/action', {
            method: 'POST',
            headers: { 'X-CSRF-Token': value },
        })

        createCsrfMiddleware(readCookies).onRequest({ request })

        expect(request.headers.get('x-csrf-token')).toBe(value)
        expect(readCookies).not.toHaveBeenCalled()
    })

    it.each(['', 'lef_csrf_token=%malformed', 'lef_csrf_token=%0Ainvalid'])('omits an unavailable token', (cookies) => {
        const request = new Request('https://app.example.test/v1/action', { method: 'POST' })

        expect(() => createCsrfMiddleware(() => cookies).onRequest({ request })).not.toThrow()
        expect(request.headers.has('x-csrf-token')).toBe(false)
    })

    it('reads the current browser cookie for each unsafe request', () => {
        const cookies = vi.spyOn(document, 'cookie', 'get').mockReturnValue('lef_csrf_token=first')
        const middleware = createCsrfMiddleware()
        const first = new Request('https://app.example.test/v1/action', { method: 'POST' })
        const second = new Request('https://app.example.test/v1/action', { method: 'POST' })

        middleware.onRequest({ request: first })
        cookies.mockReturnValue('lef_csrf_token=second')
        middleware.onRequest({ request: second })

        expect(first.headers.get('x-csrf-token')).toBe('first')
        expect(second.headers.get('x-csrf-token')).toBe('second')
        expect(cookies).toHaveBeenCalledTimes(2)
    })

    it('does not log or persist cookies or tokens', () => {
        const logs = ['debug', 'info', 'log', 'warn', 'error'] as const
        const logging = logs.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined))
        const storage = ['getItem', 'setItem', 'removeItem', 'clear'] as const
        const persistence = storage.map((method) => vi.spyOn(Storage.prototype, method))
        const cookieWrite = vi.spyOn(document, 'cookie', 'set')
        const middleware = createCsrfMiddleware(() => 'lef_session=unread-session; lef_csrf_token=csrf-value')

        middleware.onRequest({ request: new Request('https://app.example.test/v1/action', { method: 'POST' }) })
        createCsrfMiddleware(() => 'lef_csrf_token=%malformed').onRequest({
            request: new Request('https://app.example.test/v1/action', { method: 'POST' }),
        })

        for (const method of [...logging, ...persistence, cookieWrite]) {
            expect(method).not.toHaveBeenCalled()
        }
    })
})
