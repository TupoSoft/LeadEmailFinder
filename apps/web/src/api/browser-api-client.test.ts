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
            user: {
                id: 'user-1',
                name: 'Example user',
                email: 'member@example.test',
                emailVerified: true,
                image: null,
            },
        } satisfies CurrentAccount
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(Response.json(account)))

        const result = await getCurrentAccount(createBrowserApiClient({ fetch }))

        expect(requestedPaths).toEqual(['/v1/me'])
        const request = fetch.mock.calls[0][0]
        expect(request.url).toBe(new URL('/v1/me', document.baseURI).href)
        expect(request.method).toBe('GET')
        expect(request.cache).toBe('no-store')
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.has('authorization')).toBe(false)
        expect(request.headers.has('cookie')).toBe(false)
        expect(result.data).toEqual(account)
        expect(result.error).toBeUndefined()
    })

    it('projects only safe user fields before identity enters session caches', async () => {
        const user = { id: 'user-1', name: 'Example', email: 'user@example.test', emailVerified: true, image: null }
        const fetch = vi.fn(() =>
            Promise.resolve(
                Response.json({
                    user: { ...user, internalRole: 'private', accessToken: 'private-access-token' },
                    session: { token: 'private-session-token', ipAddress: 'private-ip' },
                }),
            ),
        )

        const result = await getCurrentAccount(createBrowserApiClient({ fetch }))

        expect(result.data).toEqual({ user })
        expect(JSON.stringify(result.data)).not.toContain('private')
    })

    it.each([
        [401, 'authentication_required'],
        [403, 'email_verification_required'],
    ] as const)('preserves a typed %s current-account rejection', async (status, code) => {
        const fetch = vi.fn(() => Promise.resolve(Response.json({ code }, { status })))

        const result = await getCurrentAccount(createBrowserApiClient({ fetch }))

        expect(result.data).toBeUndefined()
        expect(result.error?.code).toBe(code)
        expect(result.response.status).toBe(status)
    })

    it('sends JSON on sign-out without reading or exposing cookie tokens', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(Response.json({ success: true })),
        )
        const client = createBrowserApiClient({
            fetch,
        })

        await client.POST('/v1/auth/sign-out', { body: {} })

        expect(requestedPaths).toEqual(['/v1/auth/sign-out'])
        const request = fetch.mock.calls[0][0]
        expect(request.method).toBe('POST')
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(await request.clone().json()).toEqual({})
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.has('cookie')).toBe(false)
        expect(request.headers.has('authorization')).toBe(false)
    })

    it('preserves explicit caller headers through the generated client', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(Response.json({ success: true })),
        )
        const client = createBrowserApiClient({ fetch })

        await client.POST('/v1/auth/sign-out', { body: {}, headers: { 'X-Request-Id': 'request-id' } })

        expect(fetch.mock.calls[0][0].headers.get('x-request-id')).toBe('request-id')
    })
})
