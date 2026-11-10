// Keep the corresponding Nginx locations in docker/web/default.conf identical.
export const API_PREFIXES = ['/v1', '/docs'] as const

// Reserve retired API namespaces so requests receive JSON 404s instead of the SPA document.
const RETIRED_API_PREFIXES = ['/verifyBatch', '/emails', '/credits'] as const
export const API_EXACT_PATHS = ['/health', '/openapi.json', '/docs-json', '/docs-yaml'] as const

const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Ownership is checked after the same single decoding and slash normalization as Nginx.
const API_PROXY_PATTERNS = [
    `^(?:${[...API_PREFIXES, ...RETIRED_API_PREFIXES].map(escapePattern).join('|')})(?:/|\\?|$)`,
    `^(?:${API_EXACT_PATHS.map(escapePattern).join('|')})(?:\\?|$)`,
]

export function isApiRequest(target: string): boolean {
    try {
        const pathname = decodeURIComponent(target.split('?')[0])
        const segments: string[] = []
        for (const segment of pathname.split('/')) {
            if (segment === '..') segments.pop()
            else if (segment !== '' && segment !== '.') segments.push(segment)
        }
        const trailingSlash = /\/(?:\.|\.\.)?$/.test(pathname) && segments.length > 0 ? '/' : ''
        const normalized = `/${segments.join('/')}${trailingSlash}`
        return API_PROXY_PATTERNS.some(pattern => new RegExp(pattern).test(normalized))
    } catch {
        return false
    }
}

export const STATIC_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
} as const
