import { CookieOptions } from 'express'
import { BrowserSessionConfiguration } from '../application/bff-session-configuration'

const PENDING_LOGIN_STATE_MAX_AGE_MS = 600_000

function buildLoginStateCookieScope(configuration: BrowserSessionConfiguration): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/v1/auth',
        secure: configuration.isSecureCookie,
    }
}

export function buildSessionCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: configuration.isSecureCookie,
        maxAge: configuration.sessionAbsoluteTimeoutMs,
    }
}

export function buildCsrfCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    return {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        secure: configuration.isSecureCookie,
        maxAge: configuration.sessionAbsoluteTimeoutMs,
    }
}

export function buildLoginStateCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    return {
        ...buildLoginStateCookieScope(configuration),
        maxAge: PENDING_LOGIN_STATE_MAX_AGE_MS,
    }
}

export function buildLoginStateClearCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    return buildLoginStateCookieScope(configuration)
}

export function buildSessionClearCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    const scope = buildSessionCookieOptions(configuration)
    delete scope.maxAge
    return scope
}

export function buildCsrfClearCookieOptions(configuration: BrowserSessionConfiguration): CookieOptions {
    const scope = buildCsrfCookieOptions(configuration)
    delete scope.maxAge
    return scope
}
