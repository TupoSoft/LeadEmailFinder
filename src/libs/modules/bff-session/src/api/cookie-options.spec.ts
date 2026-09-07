import { BffSessionConfiguration } from '../application/bff-session-configuration'
import {
    buildCsrfCookieOptions,
    buildCsrfClearCookieOptions,
    buildSessionClearCookieOptions,
    buildLoginStateClearCookieOptions,
    buildLoginStateCookieOptions,
    buildSessionCookieOptions,
} from './cookie-options'

function configWith(isSecureCookie: boolean): BffSessionConfiguration {
    return {
        appBaseUrl: isSecureCookie ? 'https://app.example.com' : 'http://localhost:53000',
        issuer: 'https://issuer',
        backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
        jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
        clientId: 'lef-web-bff',
        clientSecret: 'secret',
        sessionIdleTimeoutMs: 1000,
        sessionAbsoluteTimeoutMs: 2000,
        isSecureCookie,
    }
}

describe('cookie-options', () => {
    it('builds an HttpOnly session cookie scoped to the whole app', () => {
        const options = buildSessionCookieOptions(configWith(false))

        expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 2000 })
    })

    it('builds a non-HttpOnly CSRF cookie so the frontend can read it', () => {
        const options = buildCsrfCookieOptions(configWith(false))

        expect(options).toMatchObject({ httpOnly: false, sameSite: 'lax', path: '/', secure: false })
    })

    it('builds a login-state cookie scoped to /v1/auth with a 10-minute lifetime', () => {
        const options = buildLoginStateCookieOptions(configWith(false))

        expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/v1/auth', maxAge: 600_000 })
    })

    it('clears login state with the original scope and security attributes but no lifetime', () => {
        const options = buildLoginStateClearCookieOptions(configWith(false))

        expect(options).toEqual({ httpOnly: true, sameSite: 'lax', path: '/v1/auth', secure: false })
        expect(options).not.toHaveProperty('maxAge')
        expect(options).not.toHaveProperty('expires')
    })

    it.each([false, true])('clears session and CSRF cookies with matching scope for secure=%s', secure => {
        const configuration = configWith(secure)
        for (const [write, clear] of [
            [buildSessionCookieOptions(configuration), buildSessionClearCookieOptions(configuration)],
            [buildCsrfCookieOptions(configuration), buildCsrfClearCookieOptions(configuration)],
        ]) {
            const scope = { ...write }
            delete scope.maxAge
            expect(clear).toEqual(scope)
            expect(clear).not.toHaveProperty('maxAge')
            expect(clear).not.toHaveProperty('expires')
        }
    })

    it('marks cookies secure when the app base URL is https', () => {
        expect(buildSessionCookieOptions(configWith(true)).secure).toBe(true)
        expect(buildCsrfCookieOptions(configWith(true)).secure).toBe(true)
        expect(buildLoginStateCookieOptions(configWith(true)).secure).toBe(true)
        expect(buildLoginStateClearCookieOptions(configWith(true)).secure).toBe(true)
    })
})
