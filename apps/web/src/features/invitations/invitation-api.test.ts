import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserApiClient } from '../../api/browser-api-client'
import { createInvitationApi } from './invitation-api'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => vi.unstubAllGlobals())
const preview = {
    organizationName: 'Example',
    email: 'member@example.test',
    role: 'member',
    expiresAt: '2026-09-09T12:00:00Z',
    status: 'pending',
}

describe('public invitation transport', () => {
    it.each([
        [404, undefined, 'unknown'],
        [410, 'invitation_expired', 'expired'],
        [410, 'invitation_consumed', 'consumed'],
        [410, undefined, 'unavailable'],
        [410, 'unexpected', 'unavailable'],
        [409, undefined, 'conflict'],
        [400, undefined, 'invalid'],
        [503, undefined, 'unavailable'],
    ])('maps only known public errors (%s, %s)', async (status, code, reason) => {
        const api = createInvitationApi(
            createBrowserApiClient({
                fetch: () => Promise.resolve(Response.json({ code }, { status: Number(status) })),
                readCookies: () => '',
            }),
        )
        await expect(api.preview(crypto.randomUUID(), new AbortController().signal)).rejects.toMatchObject({ reason })
    })

    it('uses uncached, credential-free, no-referrer transport and projects only pending preview fields', async () => {
        let observed: Request | undefined
        const marker = crypto.randomUUID()
        const api = createInvitationApi(
            createBrowserApiClient({
                readCookies: () => '',
                fetch: request => {
                    observed = request
                    return Promise.resolve(Response.json({ ...preview, unexpectedToken: marker }))
                },
            }),
        )
        const result = await api.preview(marker, new AbortController().signal)
        expect(Object.keys(result).sort()).toEqual(['email', 'expiresAt', 'organizationName', 'role', 'status'])
        expect(observed?.credentials).toBe('omit')
        expect(observed?.cache).toBe('no-store')
        expect(observed?.referrerPolicy).toBe('no-referrer')
        expect(observed?.headers.has('authorization')).toBe(false)
        expect(observed?.headers.has('x-csrf-token')).toBe(false)
    })

    it.each([{ expiresAt: 'invalid' }, { status: 'accepted' }, { role: 'unexpected' }, { email: null }])(
        'rejects a malformed preview as a recoverable error',
        async changed => {
            const api = createInvitationApi(
                createBrowserApiClient({
                    fetch: () => Promise.resolve(Response.json({ ...preview, ...changed })),
                    readCookies: () => '',
                }),
            )
            await expect(api.preview(crypto.randomUUID(), new AbortController().signal)).rejects.toMatchObject({
                reason: 'unavailable',
            })
        },
    )

    it('discards every field in the first acceptance response', async () => {
        const api = createInvitationApi(
            createBrowserApiClient({
                fetch: () =>
                    Promise.resolve(
                        Response.json({ email: preview.email, organizationId: 'org', role: 'member' }, { status: 201 }),
                    ),
                readCookies: () => '',
            }),
        )
        await expect(
            api.accept(crypto.randomUUID(), crypto.randomUUID(), new AbortController().signal),
        ).resolves.toBeUndefined()
    })
})
