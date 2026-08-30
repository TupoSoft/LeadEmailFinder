export function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) {
        return {}
    }

    return Object.fromEntries(
        header
            .split(';')
            .map((part): [string, string] => {
                const separatorIndex = part.indexOf('=')
                return separatorIndex === -1
                    ? [part.trim(), '']
                    : [part.slice(0, separatorIndex).trim(), decodeURIComponent(part.slice(separatorIndex + 1).trim())]
            })
            .filter(([name]) => name.length > 0),
    )
}

export function firstHeaderValue(header: string | string[] | undefined): string | undefined {
    return Array.isArray(header) ? header[0] : header
}
