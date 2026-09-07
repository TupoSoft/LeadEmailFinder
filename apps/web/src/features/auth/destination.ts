export function safeDestination(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/app')) return '/app'
    if (
        /[\\\s]/.test(value) ||
        [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        /%(?![0-9a-f]{2})/i.test(value)
    )
        return '/app'
    try {
        const path = value.split(/[?#]/, 1)[0]
        if (
            decodeURIComponent(path) !== path ||
            path.includes('//') ||
            path.split('/').some(segment => segment === '.' || segment === '..')
        )
            return '/app'
        const url = new URL(value, 'https://application.invalid')
        if (
            url.origin !== 'https://application.invalid' ||
            !/^\/app(?:\/|$)/.test(url.pathname) ||
            /^\/app\/(?:session-expired|account-unavailable|forbidden)(?:\/|$)/.test(url.pathname) ||
            /\/auth(?:\/|$)/.test(url.pathname)
        )
            return '/app'
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return '/app'
    }
}

export function signInHref(destination: unknown = '/app'): string {
    return `/v1/auth/login?destination=${encodeURIComponent(safeDestination(destination))}`
}
