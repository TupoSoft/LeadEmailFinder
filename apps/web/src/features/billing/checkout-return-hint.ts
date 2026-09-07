const hintKey = 'lef-checkout-return'
const lifetime = 30 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function clearCheckoutHint(): void {
    try {
        sessionStorage.removeItem(hintKey)
    } catch {
        // Storage is optional: authoritative history remains available.
    }
}

export function rememberCheckoutHint(id: string, now = Date.now()): void {
    if (!uuid.test(id)) return
    try {
        sessionStorage.setItem(hintKey, JSON.stringify({ id, expiresAt: now + lifetime }))
    } catch {
        // A browser that blocks storage still supports checkout and generic return recovery.
    }
}

export function readCheckoutHint(search: string, now = Date.now()): string | undefined {
    const supplied = new URLSearchParams(search).get('purchaseId')
    if (supplied !== null && uuid.test(supplied)) return supplied
    try {
        const raw = sessionStorage.getItem(hintKey)
        const stored: unknown = raw === null ? null : JSON.parse(raw)
        if (
            typeof stored === 'object' &&
            stored !== null &&
            'id' in stored &&
            typeof stored.id === 'string' &&
            uuid.test(stored.id) &&
            'expiresAt' in stored &&
            typeof stored.expiresAt === 'number' &&
            stored.expiresAt > now &&
            stored.expiresAt <= now + lifetime
        )
            return stored.id
    } catch {
        // Malformed or inaccessible storage is not payment evidence.
    }
    clearCheckoutHint()
    return undefined
}
