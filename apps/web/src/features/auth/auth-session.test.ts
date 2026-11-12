import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, StaleAuthResponseError } from '../../api/api-error'
import type { CurrentAccount } from '../../api/current-account'
import { AuthSession, currentAccountQueryKey, type BoundaryChannel } from './auth-session'
import { createApplicationQueryClient, retrySafeRead } from './query-client'

const account = (id = 'user-1'): CurrentAccount => ({
    user: { id, name: 'Example user', email: 'member@example.test', emailVerified: true, image: null },
})

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}

function createSession(
    fetch: (request: Request) => Promise<Response>,
    channelFactory: () => BoundaryChannel | null = () => null,
) {
    return new AuthSession({ fetch, channelFactory })
}

async function seedPrivateCaches(session: AuthSession) {
    session.queryClient.setQueryData(['organization', 'private'], { previousMemberEmail: 'previous@example.test' })
    const mutation = session.queryClient.getMutationCache().build(session.queryClient, {
        mutationFn: (variables: { secret: string }) => Promise.resolve(variables),
    })
    await mutation.execute({ secret: 'previous-member-variables' })
}

beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => vi.unstubAllGlobals())

describe('authenticated cache boundary', () => {
    it('preserves explicit no-referrer and no-store policy when adding the session abort signal', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(Response.json(account())))
        const session = createSession(fetch)
        await session.api.GET('/v1/me', { referrerPolicy: 'no-referrer', cache: 'no-store' })
        expect(fetch.mock.calls[0][0].referrerPolicy).toBe('no-referrer')
        expect(fetch.mock.calls[0][0].cache).toBe('no-store')
    })

    it('bootstraps once while a request is pending and uses only same-origin cookie transport', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(Response.json(account())))
        const session = createSession(fetch)
        const first = session.bootstrap()
        expect(session.bootstrap()).toBe(first)
        await first
        expect(fetch).toHaveBeenCalledOnce()
        expect(session.getSnapshot()).toEqual({ status: 'authenticated', account: account(), accessDenied: false })
        expect(session.queryClient.getQueryData(currentAccountQueryKey)).toEqual(account())
        const request = fetch.mock.calls[0][0]
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.has('authorization')).toBe(false)
        expect(request.headers.has('cookie')).toBe(false)
    })

    it('clears query data and mutation variables on sign-out initiation and waits for confirmed success', async () => {
        const logout = deferred<Response>()
        const fetch = vi.fn<(request: Request) => Promise<Response>>(request =>
            request.method === 'POST' ? logout.promise : Promise.resolve(Response.json(account())),
        )
        const session = createSession(fetch)
        await session.bootstrap()
        await seedPrivateCaches(session)
        const first = session.signOut()
        expect(session.signOut()).toBe(first)
        expect(session.getSnapshot().status).toBe('signing-out')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        expect(fetch.mock.calls[1][0].headers.get('content-type')).toBe('application/json')
        expect(await fetch.mock.calls[1][0].clone().json()).toEqual({})
        logout.resolve(Response.json({ success: true }))
        await first
        expect(session.getSnapshot().status).toBe('signed-out')
    })

    it.each([false, true])(
        'discards late authenticated mutation callbacks after sign-out (failure: %s)',
        async failure => {
            const delayed = deferred<{ previousMember: string }>()
            const session = createSession(request =>
                Promise.resolve(
                    request.method === 'POST' ? Response.json({ success: true }) : Response.json(account()),
                ),
            )
            await session.bootstrap()
            const onSuccess = vi.fn((data: { previousMember: string }) => {
                session.queryClient.setQueryData(['private'], data)
            })
            const onError = vi.fn(() => {
                session.queryClient.setQueryData(['private'], 'old-error-state')
            })
            const onSettled = vi.fn()
            const mutationFn = vi.fn(() => delayed.promise)
            const mutation = session.queryClient.getMutationCache().build(
                session.queryClient,
                session.mutationOptions({
                    mutationFn,
                    onSuccess,
                    onError,
                    onSettled,
                }),
            )
            const pending = mutation.execute(undefined)
            const rejected = expect(pending).rejects.toBeInstanceOf(Error)
            await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledOnce())
            await session.signOut()
            if (failure) delayed.reject(new Error('old-provider-error'))
            else delayed.resolve({ previousMember: 'previous@example.test' })
            await rejected
            expect(onSuccess).not.toHaveBeenCalled()
            expect(onError).not.toHaveBeenCalled()
            expect(onSettled).not.toHaveBeenCalled()
            expect(session.queryClient.getQueryCache().getAll()).toEqual([])
            expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        },
    )

    it.each([401, 403, 500, 200])(
        'keeps logout unconfirmed for HTTP %s and permits an explicit retry',
        async status => {
            let logoutAttempts = 0
            const fetch = vi.fn((request: Request) => {
                if (request.method !== 'POST') return Promise.resolve(Response.json(account()))
                logoutAttempts += 1
                return Promise.resolve(
                    logoutAttempts === 1 ? new Response(null, { status }) : Response.json({ success: true }),
                )
            })
            const session = createSession(fetch)
            await session.bootstrap()
            await seedPrivateCaches(session)
            await session.signOut()
            expect(session.getSnapshot().status).toBe('logout-uncertain')
            expect(session.queryClient.getQueryCache().getAll()).toEqual([])
            expect(session.queryClient.getMutationCache().getAll()).toEqual([])
            expect(logoutAttempts).toBe(1)
            await session.signOut()
            expect(logoutAttempts).toBe(2)
            expect(session.getSnapshot().status).toBe('signed-out')
        },
    )

    it('discards network exception details and retains the uncertain logout state', async () => {
        const session = createSession(request =>
            request.method === 'POST'
                ? Promise.reject(new Error('provider-token-secret'))
                : Promise.resolve(Response.json(account())),
        )
        await session.bootstrap()
        await session.signOut()
        expect(session.getSnapshot()).toMatchObject({ status: 'logout-uncertain', error: { status: 0 } })
        expect(JSON.stringify(session.getSnapshot())).not.toContain('provider-token-secret')
    })

    it.each([false, true])('rejects a late old-generation response after logout (failure: %s)', async failure => {
        const oldRead = deferred<Response>()
        let readCount = 0
        const session = createSession(request => {
            if (request.method === 'POST') return Promise.resolve(Response.json({ success: true }))
            return ++readCount === 1 ? Promise.resolve(Response.json(account())) : oldRead.promise
        })
        await session.bootstrap()
        const pending = session.api.GET('/v1/me')
        const rejected = expect(pending).rejects.toBeInstanceOf(StaleAuthResponseError)
        await vi.waitFor(() => expect(readCount).toBe(2))
        await session.signOut()
        if (failure) oldRead.reject(new Error('old-provider-failure'))
        else oldRead.resolve(Response.json(account()))
        await rejected
        expect(session.getSnapshot().status).toBe('signed-out')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
    })

    it('fences a response whose body finishes parsing after logout', async () => {
        const body = deferred<CurrentAccount>()
        const lateResponse = Response.json(account())
        lateResponse.headers.set('content-length', '1')
        const json = vi.spyOn(lateResponse, 'json').mockImplementation(() => body.promise)
        let readCount = 0
        const session = createSession(request =>
            request.method === 'POST'
                ? Promise.resolve(Response.json({ success: true }))
                : Promise.resolve(++readCount === 1 ? Response.json(account()) : lateResponse),
        )
        await session.bootstrap()
        const pending = session.api.GET('/v1/me')
        const rejected = expect(pending).rejects.toBeInstanceOf(StaleAuthResponseError)
        await vi.waitFor(() => expect(json).toHaveBeenCalled())
        await session.signOut()
        body.resolve(account())
        await rejected
    })

    it.each(['named', 'request'])(
        'aborts an old mutation transport and fences its final promise across sign-out (%s)',
        async operation => {
            const oldResponse = deferred<Response>()
            const fetch = vi
                .fn<(request: Request) => Promise<Response>>()
                .mockImplementationOnce(() => oldResponse.promise)
                .mockImplementation(() => Promise.resolve(Response.json({ success: true })))
            const session = createSession(fetch)
            const obsolete =
                operation === 'named'
                    ? session.api.POST('/v1/auth/sign-out', { body: {} })
                    : session.api.request('post', '/v1/auth/sign-out', { body: {} })
            const rejected = expect(obsolete).rejects.toBeInstanceOf(StaleAuthResponseError)
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
            const previousSignal = fetch.mock.calls[0][0].signal

            await session.signOut()
            oldResponse.resolve(Response.json({ success: true }))
            await rejected

            expect(previousSignal.aborted).toBe(true)
            expect(fetch).toHaveBeenCalledTimes(2)
            expect(session.getSnapshot().status).toBe('signed-out')
        },
    )

    it('distinguishes initial 401 from expired sessions and clears caches on both', async () => {
        let status = 401
        const session = createSession(() =>
            Promise.resolve(
                status === 200
                    ? Response.json(account())
                    : Response.json({ code: 'authentication_required' }, { status }),
            ),
        )
        await seedPrivateCaches(session)
        await session.bootstrap()
        expect(session.getSnapshot().status).toBe('unauthenticated')
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        status = 200
        await session.bootstrap()
        await seedPrivateCaches(session)
        status = 401
        await session.bootstrap()
        expect(session.getSnapshot().status).toBe('session-expired')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
    })

    it('clears an unusable human account but preserves an operation-level permission denial', async () => {
        let blockedAccount = false
        const session = createSession(request =>
            Promise.resolve(
                new URL(request.url).pathname === '/health'
                    ? Response.json({ raw: 'private-provider-reason' }, { status: 403 })
                    : blockedAccount
                      ? Response.json({ code: 'email_verification_required' }, { status: 403 })
                      : Response.json(account()),
            ),
        )
        await session.bootstrap()
        await seedPrivateCaches(session)
        await expect(session.api.GET('/health')).rejects.toMatchObject({ category: 'access-denied', status: 403 })
        expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', accessDenied: true })
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(1)
        session.clearAccessDenied()
        expect(session.getSnapshot()).toMatchObject({ accessDenied: false })
        blockedAccount = true
        await session.bootstrap()
        expect(session.getSnapshot().status).toBe('account-unavailable')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
    })

    it('retains private data when a renewed session belongs to the same user', async () => {
        let name = 'Original name'
        const session = createSession(() => {
            const current = account()
            return Promise.resolve(Response.json({ user: { ...current.user, name } }))
        })
        await session.bootstrap()
        await seedPrivateCaches(session)
        name = 'Updated name'

        await session.bootstrap()

        expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', account: { user: { name } } })
        expect(session.queryClient.getQueryData(['organization', 'private'])).toEqual({
            previousMemberEmail: 'previous@example.test',
        })
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(1)
    })

    it.each([false, true])('replaces the user identity and rejects old responses (failure: %s)', async failure => {
        const oldRead = deferred<Response>()
        let id = 'user-1'
        const session = createSession(request =>
            new URL(request.url).pathname === '/health' ? oldRead.promise : Promise.resolve(Response.json(account(id))),
        )
        await session.bootstrap()
        await seedPrivateCaches(session)
        const pending = session.api.GET('/health')
        const rejected = expect(pending).rejects.toBeInstanceOf(StaleAuthResponseError)
        await Promise.resolve()
        id = 'user-2'
        await session.bootstrap()
        expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', account: account('user-2') })
        expect(session.queryClient.getQueryCache().getAll()).toHaveLength(1)
        expect(session.queryClient.getQueryData(['organization', 'private'])).toBeUndefined()
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        if (failure) oldRead.reject(new Error('late-failure'))
        else oldRead.resolve(Response.json({ old: 'organization-data' }))
        await rejected
        expect(session.getSnapshot()).toMatchObject({ account: account('user-2') })
    })

    it('clears a BFcache snapshot before rebootstrap, and pagehide saves only a loading shell', async () => {
        const reload = deferred<Response>()
        let reads = 0
        const session = createSession(() =>
            ++reads === 1 ? Promise.resolve(Response.json(account())) : reload.promise,
        )
        const disconnect = session.connect()
        await session.bootstrap()
        await seedPrivateCaches(session)
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
        expect(session.getSnapshot().status).toBe('loading')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
        expect(session.getSnapshot().status).toBe('loading')
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        reload.resolve(Response.json(account('user-2')))
        await vi.waitFor(() => expect(session.getSnapshot()).toMatchObject({ account: account('user-2') }))
        disconnect()
    })
})

describe('query defaults', () => {
    it('disables retries and implicit polling until a safe read opts in', () => {
        const defaults = createApplicationQueryClient().getDefaultOptions()
        expect(defaults.mutations?.retry).toBe(false)
        expect(defaults.queries).toMatchObject({
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchInterval: false,
            staleTime: 0,
        })
        expect(retrySafeRead(0, new ApiError(503, 'request-failed'))).toBe(true)
        expect(retrySafeRead(1, new ApiError(503, 'request-failed'))).toBe(false)
        for (const status of [400, 401, 403, 404, 409, 422])
            expect(retrySafeRead(0, new ApiError(status, 'request-failed'))).toBe(false)
        expect(retrySafeRead(0, new StaleAuthResponseError())).toBe(false)
    })

    it('retries one transient session read but never retries an authentication failure', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(Response.json({}, { status: 503 }))
            .mockResolvedValueOnce(Response.json(account()))
        const session = createSession(fetch)
        await session.bootstrap()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(session.getSnapshot().status).toBe('authenticated')
    })
})
