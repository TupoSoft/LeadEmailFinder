// Pure URL policy shared by the server adapter and the browser build/runtime.
// Errors deliberately omit input: a rejected provider URL may contain credentials.
function parseCheckoutUrl(raw: string): URL {
    if (!/^https?:\/\//i.test(raw) || /[\s\\]/.test(raw) || raw.includes('#')) {
        throw new Error('Checkout URL is not allowed')
    }
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new Error('Checkout URL is not allowed')
    }
    const authority = raw.slice(raw.indexOf('//') + 2).split(/[/?]/, 1)[0]
    if (authority.includes('@') || url.username || url.password || (url.protocol === 'http:' && !isLoopback(url))) {
        throw new Error('Checkout URL is not allowed')
    }
    return url
}

function isLoopback(url: URL): boolean {
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function resolveCheckoutAllowedOrigins(input: {
    provider: string
    checkoutUrl: string
    allowedOrigins?: string
}): readonly string[] {
    if (input.provider === 'stub') {
        const url = parseCheckoutUrl(input.checkoutUrl)
        if (!isLoopback(url)) throw new Error('Stub checkout requires a loopback return URL')
        return Object.freeze([url.origin])
    }
    if (input.provider !== 'paddle' || !input.allowedOrigins?.trim()) {
        throw new Error('Checkout allowed origins are required for the selected provider')
    }
    const origins = input.allowedOrigins.split(',').map(entry => {
        const raw = entry.trim()
        const url = parseCheckoutUrl(raw)
        if (url.pathname !== '/' || url.search || raw.includes('?')) {
            throw new Error('Checkout allowed origins must contain origins only')
        }
        return url.origin
    })
    return Object.freeze([...new Set(origins)].sort())
}

export function validateCheckoutRedirect(raw: string, allowedOrigins: readonly string[]): string {
    const url = parseCheckoutUrl(raw)
    if (!allowedOrigins.includes(url.origin)) throw new Error('Checkout URL is not allowed')
    return url.href
}
