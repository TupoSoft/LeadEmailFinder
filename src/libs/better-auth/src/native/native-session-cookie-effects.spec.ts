import { nativeSessionCookieEffects, nativeSessionCookieName } from './native-session-cookie-effects'

function cookies(...values: string[]): Headers {
    const headers = new Headers()
    for (const value of values) headers.append('Set-Cookie', value)
    return headers
}

describe('native session cookie effects', () => {
    it('preserves distinct cookies, including an Expires comma, on success and rejection', async () => {
        const values = ['lef_session=first; HttpOnly', 'other=; Expires=Thu, 01 Jan 1970 00:00:00 GMT']
        const emit = jest.fn()
        const result = await nativeSessionCookieEffects.run(() => {
            nativeSessionCookieEffects.capture(cookies(...values))
            return Promise.resolve('principal')
        }, emit)
        expect(result).toBe('principal')
        expect(emit).toHaveBeenLastCalledWith(values)

        await expect(
            nativeSessionCookieEffects.run(() => {
                nativeSessionCookieEffects.capture(cookies(values[1]))
                throw new Error('rejected')
            }, emit),
        ).rejects.toThrow('rejected')
        expect(emit).toHaveBeenLastCalledWith([values[1]])
    })

    it('isolates concurrent requests and drops effects outside a request scope', async () => {
        const first = jest.fn()
        const second = jest.fn()
        let release: () => void = () => undefined
        const wait = new Promise<void>(resolve => {
            release = resolve
        })
        const pending = nativeSessionCookieEffects.run(async () => {
            nativeSessionCookieEffects.capture(cookies('first=1'))
            await wait
            nativeSessionCookieEffects.capture(cookies('first=2'))
        }, first)
        await nativeSessionCookieEffects.run(() => {
            nativeSessionCookieEffects.capture(cookies('second=1'))
            release()
            return Promise.resolve()
        }, second)
        await pending
        nativeSessionCookieEffects.capture(cookies('outside=1'))
        expect(first).toHaveBeenCalledWith(['first=1', 'first=2'])
        expect(second).toHaveBeenCalledWith(['second=1'])
    })

    it('uses the actual native cookie name for HTTP and HTTPS', () => {
        expect(nativeSessionCookieName('http://localhost:53000')).toBe('lef_session')
        expect(nativeSessionCookieName('https://app.example.test')).toBe('__Secure-lef_session')
    })
})
