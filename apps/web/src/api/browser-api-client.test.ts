import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserApiClient } from './browser-api-client'
import { getCurrentAccount, type CurrentAccount } from './current-account'

const NativeRequest = globalThis.Request
let requestedPaths: string[] = []

// Node's Request lacks the browser's resolution of relative URLs against document.baseURI.
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === 'string') {
            requestedPaths.push(input)
        }
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => {
    requestedPaths = []
    vi.stubGlobal('Request', BrowserRequest)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('browser API client', () => {
    it('calls the generated current-account operation through the relative same-origin transport', async () => {
        const account = {
            email: null,
            membership: { id: 'membership-1', role: 'owner' },
            organization: { id: 'organization-1', name: 'Example organization' },
            capabilities: [],
            grantableServiceClientPermissions: [],
        } satisfies CurrentAccount
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(Response.json(account)))
        const readCookies = vi.fn(() => 'lef_csrf_token=unused')

        const result = await getCurrentAccount(createBrowserApiClient({ fetch, readCookies }))

        expect(requestedPaths).toEqual(['/v1/auth/session'])
        const request = fetch.mock.calls[0][0]
        expect(request.url).toBe(new URL('/v1/auth/session', document.baseURI).href)
        expect(request.method).toBe('GET')
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.has('authorization')).toBe(false)
        expect(request.headers.has('cookie')).toBe(false)
        expect(readCookies).not.toHaveBeenCalled()
        expect(result.data).toEqual(account)
        expect(result.error).toBeUndefined()
    })

    it.each([
        [401, 'authentication_required'],
        [403, 'human_session_required'],
    ] as const)('preserves a typed %s current-account rejection', async (status, code) => {
        const fetch = vi.fn(() => Promise.resolve(Response.json({ code }, { status })))

        const result = await getCurrentAccount(createBrowserApiClient({ fetch }))

        expect(result.data).toBeUndefined()
        expect(result.error?.code).toBe(code)
        expect(result.response.status).toBe(status)
    })

    it('applies the CSRF middleware to the generated logout operation', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(new Response(null, { status: 204 })),
        )
        const client = createBrowserApiClient({
            fetch,
            readCookies: () => 'lef_session=unread-session; lef_csrf_token=csrf%2Bvalue',
        })

        await client.POST('/v1/auth/logout')

        expect(requestedPaths).toEqual(['/v1/auth/logout'])
        const request = fetch.mock.calls[0][0]
        expect(request.method).toBe('POST')
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.get('x-csrf-token')).toBe('csrf+value')
        expect(request.headers.has('cookie')).toBe(false)
        expect(request.headers.has('authorization')).toBe(false)
    })

    it('preserves explicit caller headers through the generated client', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(new Response(null, { status: 204 })),
        )
        const readCookies = vi.fn(() => 'lef_csrf_token=unused')
        const client = createBrowserApiClient({ fetch, readCookies })

        await client.POST('/v1/auth/logout', { headers: { 'X-CSRF-Token': 'caller-token' } })

        expect(fetch.mock.calls[0][0].headers.get('x-csrf-token')).toBe('caller-token')
        expect(readCookies).not.toHaveBeenCalled()
    })
})
