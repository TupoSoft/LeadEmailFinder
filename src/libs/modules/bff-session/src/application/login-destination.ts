/** Accept only canonical application paths; never interpret a caller-supplied origin. */
export function normalizeLoginDestination(value: unknown, appBaseUrl: string): string {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/app')) return '/app'
    // Reject ambiguous encodings, backslashes, whitespace and path separators before URL parsing.
    if (
        /[\\\s]/.test(value) ||
        [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        /%(?![0-9a-f]{2})/i.test(value)
    )
        return '/app'
    try {
        const path = value.split(/[?#]/, 1)[0]
        const decodedPath = decodeURIComponent(path)
        if (
            decodedPath !== path ||
            path.includes('//') ||
            path.split('/').some(part => part === '.' || part === '..')
        ) {
            return '/app'
        }
        const destination = new URL(value, appBaseUrl)
        if (
            destination.origin !== new URL(appBaseUrl).origin ||
            (destination.pathname !== '/app' && !destination.pathname.startsWith('/app/'))
        )
            return '/app'
        if (
            /^\/app\/(?:session-expired|account-unavailable|forbidden)(?:\/|$)/.test(destination.pathname) ||
            /\/auth(?:\/|$)/.test(destination.pathname)
        )
            return '/app'
        return `${destination.pathname}${destination.search}${destination.hash}`
    } catch {
        return '/app'
    }
}
