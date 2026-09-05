import { CookieOptions } from 'express'
import { BffSessionConfiguration } from '../application/bff-session-configuration'

const PENDING_LOGIN_STATE_MAX_AGE_MS = 600_000

function buildLoginStateCookieScope(configuration: BffSessionConfiguration): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/v1/auth',
        secure: configuration.isSecureCookie,
    }
}

export function buildSessionCookieOptions(configuration: BffSessionConfiguration): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: configuration.isSecureCookie,
        maxAge: configuration.sessionAbsoluteTimeoutMs,
    }
}

export function buildCsrfCookieOptions(configuration: BffSessionConfiguration): CookieOptions {
    return {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        secure: configuration.isSecureCookie,
        maxAge: configuration.sessionAbsoluteTimeoutMs,
    }
}

export function buildLoginStateCookieOptions(configuration: BffSessionConfiguration): CookieOptions {
    return {
        ...buildLoginStateCookieScope(configuration),
        maxAge: PENDING_LOGIN_STATE_MAX_AGE_MS,
    }
}

export function buildLoginStateClearCookieOptions(configuration: BffSessionConfiguration): CookieOptions {
    return buildLoginStateCookieScope(configuration)
}
