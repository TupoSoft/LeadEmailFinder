export interface BasicCredentials {
    readonly clientId: string
    readonly clientSecret: string
}

export type ParsedBasicCredentials =
    | { readonly ok: true; readonly credentials: BasicCredentials }
    | { readonly ok: false; readonly reason: 'missing_header' | 'wrong_scheme' | 'malformed_base64' | 'missing_separator' }

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/

/** Parses an `Authorization` header into a service-client `clientId`/`clientSecret` pair. Pure and
 * side-effect-free: it never logs or echoes the header, and callers decide how to respond on failure. */
export function parseBasicCredentials(authorizationHeader: string | undefined): ParsedBasicCredentials {
    if (authorizationHeader === undefined) return { ok: false, reason: 'missing_header' }

    const spaceIndex = authorizationHeader.indexOf(' ')
    const scheme = spaceIndex === -1 ? authorizationHeader : authorizationHeader.slice(0, spaceIndex)
    const encoded = spaceIndex === -1 ? '' : authorizationHeader.slice(spaceIndex + 1).trim()
    if (scheme.toLowerCase() !== 'basic' || encoded === '') return { ok: false, reason: 'wrong_scheme' }

    if (!base64Pattern.test(encoded)) return { ok: false, reason: 'malformed_base64' }
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')

    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex === -1) return { ok: false, reason: 'missing_separator' }

    return {
        ok: true,
        credentials: { clientId: decoded.slice(0, separatorIndex), clientSecret: decoded.slice(separatorIndex + 1) },
    }
}
