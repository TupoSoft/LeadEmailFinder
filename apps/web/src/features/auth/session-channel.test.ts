import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { StaleAuthResponseError } from '../../api/api-error'
import { AuthSession, type BoundaryChannel } from './auth-session'

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
    const promise = new Promise<T>(yes => {
        resolve = yes
    })
    return { promise, resolve }
}

function channelBus() {
    const channels = new Set<BoundaryChannel>()
    const messages: unknown[] = []
    const create = (): BoundaryChannel => {
        const channel: BoundaryChannel = {
            onmessage: null,
            postMessage: message => {
                messages.push(message)
                for (const peer of channels) {
                    if (peer !== channel)
                        queueMicrotask(() => peer.onmessage?.(new MessageEvent('message', { data: message })))
                }
            },
            close: vi.fn(() => {
                channels.delete(channel)
            }),
        }
        channels.add(channel)
        return channel
    }
    return { create, messages, channels }
}

beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => vi.unstubAllGlobals())

describe('same-origin session boundaries', () => {
    it('uses only reason data, invalidates a second tab immediately, and never resurrects an account while logout is pending', async () => {
        const bus = channelBus()
        const logout = deferred<Response>()
        const first = new AuthSession({
            channelFactory: bus.create,
            fetch: request => (request.method === 'POST' ? logout.promise : Promise.resolve(Response.json(account()))),
        })
        const second = new AuthSession({
            channelFactory: bus.create,
            fetch: () => Promise.resolve(Response.json(account())),
        })
        const closeFirst = first.connect()
        const closeSecond = second.connect()
        await first.bootstrap()
        await second.bootstrap()
        second.queryClient.setQueryData(['private'], 'old-secret')
        const signingOut = first.signOut()
        await vi.waitFor(() => expect(second.getSnapshot().status).toBe('logout-uncertain'))
        expect(second.queryClient.getQueryCache().getAll()).toEqual([])
        expect(bus.messages).toEqual([
            { reason: 'principal-replaced' },
            { reason: 'principal-replaced' },
            { reason: 'sign-out' },
        ])
        logout.resolve(Response.json({ success: true }))
        await signingOut
        expect(first.getSnapshot().status).toBe('signed-out')
        expect(second.getSnapshot().status).toBe('logout-uncertain')
        // An unrelated tab's initial bootstrap must not undo this boundary with the old user.
        const third = new AuthSession({
            channelFactory: bus.create,
            fetch: () => Promise.resolve(Response.json(account())),
        })
        const closeThird = third.connect()
        await third.bootstrap()
        await vi.waitFor(() => expect(second.getSnapshot().status).toBe('logout-uncertain'))
        expect(second.queryClient.getQueryCache().getAll()).toEqual([])
        closeFirst()
        closeSecond()
        closeThird()
        expect(bus.channels.size).toBe(0)
    })

    it('announces the first safe account after a full callback document reload and replaces existing tabs without a broadcast loop', async () => {
        const bus = channelBus()
        let id = 'user-1'
        const fetch = () => Promise.resolve(Response.json(account(id)))
        const existingTab = new AuthSession({ fetch, channelFactory: bus.create })
        const closeExisting = existingTab.connect()
        await existingTab.bootstrap()
        existingTab.queryClient.setQueryData(['private'], 'old-account-data')
        id = 'user-2'
        const callbackDocument = new AuthSession({ fetch, channelFactory: bus.create })
        const closeNew = callbackDocument.connect()
        await callbackDocument.bootstrap()
        await vi.waitFor(() =>
            expect(existingTab.getSnapshot()).toMatchObject({
                status: 'authenticated',
                account: account('user-2'),
            }),
        )
        expect(existingTab.queryClient.getQueryData(['private'])).toBeUndefined()
        expect(bus.messages).toEqual([{ reason: 'principal-replaced' }, { reason: 'principal-replaced' }])
        closeExisting()
        closeNew()
    })

    it('announces the callback account even when an older document broadcasts while its first read is pending', async () => {
        const bus = channelBus()
        const oldResponse = deferred<Response>()
        const callbackResponse = deferred<Response>()
        const oldFetch = vi
            .fn()
            .mockImplementationOnce(() => oldResponse.promise)
            .mockImplementation(() => Promise.resolve(Response.json(account('user-2'))))
        const callbackFetch = vi
            .fn()
            .mockImplementationOnce(() => callbackResponse.promise)
            .mockImplementation(() => Promise.resolve(Response.json(account('user-2'))))
        const oldDocument = new AuthSession({ channelFactory: bus.create, fetch: oldFetch })
        const closeOld = oldDocument.connect()
        const pendingOld = oldDocument.bootstrap()
        await vi.waitFor(() => expect(oldFetch).toHaveBeenCalledOnce())

        // The cookie changes while the old document's already-authenticated request is still in flight.
        const callbackDocument = new AuthSession({ channelFactory: bus.create, fetch: callbackFetch })
        const closeCallback = callbackDocument.connect()
        const pendingCallback = callbackDocument.bootstrap()
        await vi.waitFor(() => expect(callbackFetch).toHaveBeenCalledOnce())
        oldResponse.resolve(Response.json(account('user-1')))
        await pendingOld

        await vi.waitFor(() => {
            expect(callbackDocument.getSnapshot()).toMatchObject({ account: account('user-2') })
            expect(oldDocument.getSnapshot()).toMatchObject({ account: account('user-2') })
        })
        callbackResponse.resolve(Response.json(account('user-2')))
        await pendingCallback
        expect(bus.messages).toEqual([{ reason: 'principal-replaced' }, { reason: 'principal-replaced' }])
        closeOld()
        closeCallback()
    })

    it('discards in-flight old-tab responses after duplicate boundaries and ignores payloads containing identity data', async () => {
        const bus = channelBus()
        const oldRead = deferred<Response>()
        const fetch = vi.fn((request: Request) =>
            new URL(request.url).pathname === '/health' ? oldRead.promise : Promise.resolve(Response.json(account())),
        )
        const session = new AuthSession({ fetch, channelFactory: bus.create })
        const close = session.connect()
        await session.bootstrap()
        const channel = [...bus.channels][0]
        channel.onmessage?.(new MessageEvent('message', { data: { reason: 'sign-out', email: 'forbidden-payload' } }))
        expect(session.getSnapshot().status).toBe('authenticated')
        const pending = session.api.GET('/health')
        const rejected = expect(pending).rejects.toBeInstanceOf(StaleAuthResponseError)
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        channel.onmessage?.(new MessageEvent('message', { data: { reason: 'sign-out' } }))
        channel.onmessage?.(new MessageEvent('message', { data: { reason: 'sign-out' } }))
        expect(session.getSnapshot().status).toBe('loading')
        expect(session.queryClient.getMutationCache().getAll()).toEqual([])
        oldRead.resolve(Response.json({ private: 'old-value' }))
        await rejected
        await vi.waitFor(() => expect(session.getSnapshot().status).toBe('logout-uncertain'))
        expect(bus.messages).toEqual([{ reason: 'principal-replaced' }])
        close()
    })

    it.each(['unavailable', 'closed'])('keeps local cleanup working when the channel is %s', async mode => {
        const channel: BoundaryChannel = {
            onmessage: null,
            postMessage: () => {
                throw new Error('closed')
            },
            close: () => {
                throw new Error('closed')
            },
        }
        const session = new AuthSession({
            channelFactory: () => {
                if (mode === 'unavailable') throw new Error('unavailable')
                return channel
            },
            fetch: request =>
                Promise.resolve(
                    request.method === 'POST' ? Response.json({ success: true }) : Response.json(account()),
                ),
        })
        const close = session.connect()
        await session.bootstrap()
        await session.signOut()
        expect(session.getSnapshot().status).toBe('signed-out')
        expect(session.queryClient.getQueryCache().getAll()).toEqual([])
        expect(() => close()).not.toThrow()
    })
})
