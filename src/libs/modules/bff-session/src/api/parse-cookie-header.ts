export function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) {
        return {}
    }

    const cookies: Record<string, string> = {}
    for (const part of header.split(';')) {
        const separatorIndex = part.indexOf('=')
        const name = (separatorIndex === -1 ? part : part.slice(0, separatorIndex)).trim()
        if (!name) {
            continue
        }

        try {
            cookies[name] = separatorIndex === -1 ? '' : decodeURIComponent(part.slice(separatorIndex + 1).trim())
        } catch {
            // Ignore only the malformed fragment so another valid callback cookie can still be used.
        }
    }

    return cookies
}

export function firstHeaderValue(header: string | string[] | undefined): string | undefined {
    return Array.isArray(header) ? header[0] : header
}
