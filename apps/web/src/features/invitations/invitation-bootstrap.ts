// This module must be the first application import: remove bearer authority before
// the router, queries, or any future telemetry can observe the document URL.
let initialToken: string | undefined

export function captureInvitationLocation(location: Location, history: History): boolean {
    const prefix = location.pathname.split('/')[1]
    try {
        if (decodeURIComponent(prefix) !== 'accept-invitation') return false
    } catch {
        return false
    }
    initialToken = undefined
    const match = /^\/[^/]+\/([^/]+)\/?$/.exec(location.pathname)
    if (match) {
        try {
            const decoded = decodeURIComponent(match[1])
            if (/^[a-zA-Z0-9_-]{1,512}$/.test(decoded)) initialToken = decoded
        } catch {
            // Malformed authority has the same safe recovery as a missing link.
        }
    }
    history.replaceState(null, '', '/accept-invitation')
    return true
}

export function takeInvitationToken(): string | undefined {
    const token = initialToken
    initialToken = undefined
    return token
}

export const isInvitationEntry = captureInvitationLocation(window.location, window.history)
window.addEventListener('pagehide', () => {
    initialToken = undefined
})
window.addEventListener('pageshow', event => {
    if (event.persisted) initialToken = undefined
})
