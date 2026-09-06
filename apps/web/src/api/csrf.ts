import type { Middleware } from '@tuposoft/lead-email-finder-api-client'

const csrfCookieName = 'lef_csrf_token'
const csrfHeaderName = 'x-csrf-token'
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function readCsrfToken(cookies: string): string | undefined {
    for (const cookie of cookies.split(';')) {
        const separator = cookie.indexOf('=')
        if (separator < 0 || cookie.slice(0, separator).trim() !== csrfCookieName) {
            continue
        }

        try {
            const token = decodeURIComponent(cookie.slice(separator + 1).trim())
            // Ignore malformed header values without exposing the cookie in an error.
            return token.trim() && !/[^\x20-\x7e]/.test(token) ? token : undefined
        } catch {
            return undefined
        }
    }

    return undefined
}

function readBrowserCookies(): string {
    return typeof document === 'undefined' ? '' : document.cookie
}

export function createCsrfMiddleware(readCookies: () => string = readBrowserCookies) {
    return {
        onRequest({ request }: { request: Request }) {
            if (!unsafeMethods.has(request.method.toUpperCase()) || request.headers.has(csrfHeaderName)) {
                return
            }

            const token = readCsrfToken(readCookies())
            if (token !== undefined) {
                request.headers.set(csrfHeaderName, token)
            }
        },
    } satisfies Middleware
}
