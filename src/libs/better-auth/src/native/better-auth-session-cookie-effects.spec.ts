import { betterAuthSessionCookieEffects, betterAuthSessionCookieName } from './better-auth-session-cookie-effects'

function cookies(...values: string[]): Headers {
    const headers = new Headers()
    for (const value of values) headers.append('Set-Cookie', value)
    return headers
}

describe('Better Auth session cookie effects', () => {
    it('preserves distinct cookies, including an Expires comma, on success and rejection', async () => {
        const values = ['lef_session=first; HttpOnly', 'other=; Expires=Thu, 01 Jan 1970 00:00:00 GMT']
        const emit = jest.fn()
        const result = await betterAuthSessionCookieEffects.run(() => {
            betterAuthSessionCookieEffects.capture(cookies(...values))
            return Promise.resolve('principal')
        }, emit)
        expect(result).toBe('principal')
        expect(emit).toHaveBeenLastCalledWith(values)

        await expect(
            betterAuthSessionCookieEffects.run(() => {
                betterAuthSessionCookieEffects.capture(cookies(values[1]))
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
        const pending = betterAuthSessionCookieEffects.run(async () => {
            betterAuthSessionCookieEffects.capture(cookies('first=1'))
            await wait
            betterAuthSessionCookieEffects.capture(cookies('first=2'))
        }, first)
        await betterAuthSessionCookieEffects.run(() => {
            betterAuthSessionCookieEffects.capture(cookies('second=1'))
            release()
            return Promise.resolve()
        }, second)
        await pending
        betterAuthSessionCookieEffects.capture(cookies('outside=1'))
        expect(first).toHaveBeenCalledWith(['first=1', 'first=2'])
        expect(second).toHaveBeenCalledWith(['second=1'])
    })

    it('uses the actual Better Auth cookie name for HTTP and HTTPS', () => {
        expect(betterAuthSessionCookieName('http://localhost:53000')).toBe('lef_session')
        expect(betterAuthSessionCookieName('https://app.example.test')).toBe('__Secure-lef_session')
    })
})
