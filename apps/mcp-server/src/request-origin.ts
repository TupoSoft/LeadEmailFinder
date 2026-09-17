/** A canonical origin is exactly `scheme://host[:port]` with no userinfo, path, query, or fragment. */
function canonicalizeOrigin(value: string): string | undefined {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        return undefined
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (url.username !== '' || url.password !== '') return undefined
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return undefined
    if (url.origin !== value) return undefined
    return url.origin
}

/** Parses `MCP_ALLOWED_ORIGINS`. An unset or blank value means no origin is trusted. Throws on any
 * malformed entry so the executable can refuse to start rather than run with a misconfigured allowlist. */
export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
    if (raw === undefined || raw.trim() === '') return new Set()
    const origins = new Set<string>()
    for (const rawEntry of raw.split(',')) {
        const entry = rawEntry.trim()
        if (entry === '') throw new Error('MCP_ALLOWED_ORIGINS contains an empty entry')
        const canonical = canonicalizeOrigin(entry)
        if (canonical === undefined) throw new Error('MCP_ALLOWED_ORIGINS contains an invalid origin')
        origins.add(canonical)
    }
    return origins
}

/** Node folds repeated header names case-insensitively but keeps every occurrence in `rawHeaders`;
 * reading it directly (instead of the normalized `headers` object) is how a duplicate `Origin` header
 * is detected regardless of the capitalization each occurrence used. */
function originHeaderValues(rawHeaders: readonly string[]): string[] {
    const values: string[] = []
    for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
        if (rawHeaders[index]?.toLowerCase() === 'origin') values.push(rawHeaders[index + 1] ?? '')
    }
    return values
}

/** An absent `Origin` header is allowed (native MCP clients do not send one). A present header must
 * occur exactly once and contain a single canonical origin present in `allowedOrigins`; anything else
 * -- empty, duplicated, opaque `null`, malformed, or simply not on the list -- is rejected. */
export function isRequestOriginAllowed(rawHeaders: readonly string[], allowedOrigins: ReadonlySet<string>): boolean {
    const values = originHeaderValues(rawHeaders)
    if (values.length === 0) return true
    if (values.length > 1) return false
    const value = values[0] ?? ''
    if (value === '' || value === 'null') return false
    const canonical = canonicalizeOrigin(value)
    if (canonical === undefined) return false
    return allowedOrigins.has(canonical)
}
