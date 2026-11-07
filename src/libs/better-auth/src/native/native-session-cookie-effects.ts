import { AsyncLocalStorage } from 'node:async_hooks'

const cookieEffects = new AsyncLocalStorage<string[]>()

/** Native transport effects never become part of an authentication or application result. */
export const nativeSessionCookieEffects = {
    async run<T>(operation: () => Promise<T>, emit: (cookies: readonly string[]) => void): Promise<T> {
        const cookies: string[] = []
        return cookieEffects.run(cookies, async () => {
            try {
                return await operation()
            } finally {
                emit(cookies)
            }
        })
    },

    capture(headers: Headers): void {
        const cookies = cookieEffects.getStore()
        if (cookies) cookies.push(...headers.getSetCookie())
    },
}

/** Better Auth automatically prefixes the configured cookie name on HTTPS. */
export function nativeSessionCookieName(baseUrl: string): string {
    return new URL(baseUrl).protocol === 'https:' ? '__Secure-lef_session' : 'lef_session'
}
