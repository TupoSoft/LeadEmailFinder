import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import {
    creditAdjustmentStoragePrefix,
    readCreditAdjustment,
    saveCreditAdjustment,
} from '../platform-credits/credit-adjustment-recovery'
import { AuthSession, type BoundaryChannel } from './auth-session'

const membershipId = '11111111-1111-4111-8111-111111111111'
const otherMembershipId = '33333333-3333-4333-8333-333333333333'
const organizationId = '22222222-2222-4222-8222-222222222222'
const storageKey = `${creditAdjustmentStoragePrefix}${membershipId}`
const account = (id = membershipId): CurrentAccount => ({
    email: null,
    membership: { id, role: 'owner' },
    organization: { id: organizationId, name: 'Synthetic operator' },
    capabilities: ['platform.credits.manage'],
    grantableServiceClientPermissions: [],
})
const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
const save = () =>
    expect(
        saveCreditAdjustment({
            version: 1,
            membershipId,
            organizationId,
            amount: 25,
            key: '44444444-4444-4444-8444-444444444444',
            state: 'unknown',
            createdAt: Date.now(),
        }),
    ).toBe(true)
const create = (
    fetch: (request: Request) => Promise<Response>,
    channelFactory: () => BoundaryChannel | null = () => null,
) => new AuthSession({ fetch, readCookies: () => 'lef_csrf_token=synthetic-csrf', channelFactory })

beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('Request', BrowserRequest)
})
afterEach(() => vi.unstubAllGlobals())

describe('credit recovery authentication boundary', () => {
    it('restores matching recovery only after a fresh authenticated bootstrap, without sending credits', async () => {
        save()
        const fetch = vi.fn(() => Promise.resolve(Response.json(account())))
        const session = create(fetch)
        await session.bootstrap()
        expect(readCreditAdjustment(membershipId, organizationId)?.state).toBe('unknown')
        expect(fetch).toHaveBeenCalledOnce()
        expect(session.queryClient.getQueryCache().getAll()).toHaveLength(1)
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
    })

    it('removes previous-principal recovery on both hard refresh and in-document replacement', async () => {
        save()
        let id = otherMembershipId
        const session = create(() => Promise.resolve(Response.json(account(id))))
        await session.bootstrap()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        id = membershipId
        await session.bootstrap()
        save()
        id = otherMembershipId
        await session.bootstrap()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
    })

    it.each([401, 403])('removes recovery when the current account becomes unusable (HTTP %s)', async status => {
        let active = true
        const session = create(() =>
            Promise.resolve(
                active
                    ? Response.json(account())
                    : Response.json(
                          { code: status === 401 ? 'authentication_required' : 'human_session_required' },
                          { status },
                      ),
            ),
        )
        await session.bootstrap()
        save()
        active = false
        await session.bootstrap()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        expect(session.getSnapshot().status).toBe(status === 401 ? 'session-expired' : 'account-unavailable')
    })

    it('clears recovery synchronously before the sign-out request settles', async () => {
        const session = create(request =>
            Promise.resolve(request.method === 'POST' ? new Response(null, { status: 204 }) : Response.json(account())),
        )
        await session.bootstrap()
        save()
        const pending = session.signOut()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        await pending
    })

    it('clears recovery immediately on another tab sign-out', async () => {
        const channel: BoundaryChannel = { postMessage: vi.fn(), close: vi.fn(), onmessage: null }
        const session = create(
            () => Promise.resolve(Response.json(account())),
            () => channel,
        )
        const disconnect = session.connect()
        await session.bootstrap()
        save()
        channel.onmessage?.(new MessageEvent('message', { data: { reason: 'sign-out' } }))
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        await vi.waitFor(() => expect(session.getSnapshot().status).toBe('logout-uncertain'))
        disconnect()
    })

    it.each([membershipId, otherMembershipId])(
        'reconfirms identity after cached-page restoration (%s)',
        async idAfterRestore => {
            let id = membershipId
            const session = create(() => Promise.resolve(Response.json(account(id))))
            const disconnect = session.connect()
            await session.bootstrap()
            save()
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
            expect(session.getSnapshot().status).toBe('loading')
            expect(sessionStorage.getItem(storageKey)).not.toBeNull()
            id = idAfterRestore
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
            await vi.waitFor(() => expect(session.getSnapshot().status).toBe('authenticated'))
            expect(sessionStorage.getItem(storageKey) !== null).toBe(idAfterRestore === membershipId)
            disconnect()
        },
    )

    it('keeps credit mutation authorization errors local and protects denied credit reads', async () => {
        const session = create(request =>
            Promise.resolve(
                new URL(request.url).pathname === '/v1/auth/session'
                    ? Response.json(account())
                    : Response.json({ message: 'Forbidden' }, { status: 403 }),
            ),
        )
        await session.bootstrap()
        const params = { path: { organizationId } }
        await expect(
            session.api.POST('/credits/{organizationId}', {
                params: { ...params, header: { 'Idempotency-Key': crypto.randomUUID() } },
                body: { amount: 25 },
            }),
        ).rejects.toMatchObject({ status: 403 })
        await expect(
            session.api.PUT('/credits/{organizationId}', { params, body: { amount: 25 } }),
        ).rejects.toMatchObject({ status: 403 })
        expect(session.getSnapshot()).toMatchObject({ accessDenied: false })
        await expect(session.api.GET('/credits/{organizationId}', { params })).rejects.toMatchObject({ status: 403 })
        expect(session.getSnapshot()).toMatchObject({ accessDenied: true })
    })
})
