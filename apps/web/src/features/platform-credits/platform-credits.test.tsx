import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication } from '../../app/AuthRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { PlatformCreditsPage } from './PlatformCreditsPage'
import {
    creditAdjustmentRecoveryWindowMs,
    readCreditAdjustment,
    saveCreditAdjustment,
    type CreditAdjustmentRecord,
} from './credit-adjustment-recovery'
import { creditRequestTimeoutMs } from './platform-credits-api'
import { creditsCopy as copy } from './platform-credits-copy'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
    for (const [method, open] of [
        ['showModal', true],
        ['close', false],
    ] as const)
        Object.defineProperty(HTMLDialogElement.prototype, method, {
            configurable: true,
            value: function (this: HTMLDialogElement) {
                this.open = open
            },
        })
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    sessionStorage.clear()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})
const account: CurrentAccount = {
    email: 'operator@example.test',
    membership: { id: '00000000-0000-4000-8000-000000000001', role: 'owner' },
    organization: { id: '00000000-0000-4000-8000-000000000002', name: 'Platform' },
    capabilities: ['platform.credits.manage'],
    grantableServiceClientPermissions: [],
}
const organization = {
    id: '00000000-0000-4000-8000-00000000000a',
    name: 'Example customer',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
}
const detail = `/v1/organizations/${organization.id}`
const credits = `/credits/${organization.id}`
const route = `/app/platform/organizations/${organization.id}/credits`
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}
function renderCredits({
    capabilities = account.capabilities,
    entry = route,
    intercept,
}: {
    capabilities?: CurrentAccount['capabilities']
    entry?: string
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/auth/session') return Promise.resolve(Response.json({ ...account, capabilities }))
        if (path === detail) return Promise.resolve(Response.json(organization))
        if (path === credits)
            return Promise.resolve(Response.json({ balance: 100 }, { status: request.method === 'POST' ? 201 : 200 }))
        return Promise.resolve(new Response(null, { status: 404 }))
    })
    const session = new AuthSession({
        fetch,
        channelFactory: () => null,
        readCookies: () => 'lef_csrf_token=csrf-fixture',
    })
    const router = createMemoryRouter(
        [
            {
                element: (
                    <AuthProvider session={session}>
                        <Outlet />
                    </AuthProvider>
                ),
                children: [
                    {
                        element: <ProtectedApplication />,
                        children: [
                            {
                                path: '/app/platform/organizations/:organizationId/credits',
                                element: <PlatformCreditsPage />,
                            },
                            { path: '/app/platform/organizations', element: <p>Organization directory</p> },
                            { path: '/app/forbidden', element: <ForbiddenPage /> },
                            { path: '/app/session-expired', element: <p>Session expired</p> },
                            { path: '/app/account-unavailable', element: <p>Account unavailable</p> },
                        ],
                    },
                    { path: '/outside', element: <p>Outside credits</p> },
                ],
            },
        ],
        { initialEntries: [entry] },
    )
    return { fetch, session, router, ...render(<RouterProvider router={router} />) }
}
function requests(fetch: ReturnType<typeof renderCredits>['fetch'], method: string) {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === credits && request.method === method)
}
async function review(kind: 'add' | 'set' = 'add', amount = '25') {
    const user = userEvent.setup()
    const field = await screen.findByLabelText(kind === 'add' ? copy.addAmount : copy.setAmount)
    await waitFor(() => expect(field).toBeEnabled())
    await user.type(field, amount)
    await user.click(screen.getByRole('button', { name: kind === 'add' ? copy.reviewAdd : copy.reviewSet }))
    return { user, dialog: await screen.findByRole('dialog') }
}
async function confirmAdjustment(kind: 'add' | 'set' = 'add', amount = '25') {
    const { user, dialog } = await review(kind, amount)
    await user.click(within(dialog).getByRole('button', { name: kind === 'add' ? copy.add : copy.set }))
}
function recovered(change: Partial<CreditAdjustmentRecord> = {}): CreditAdjustmentRecord {
    return {
        version: 1,
        membershipId: account.membership.id,
        organizationId: organization.id,
        amount: 25,
        key: crypto.randomUUID(),
        state: 'unknown',
        createdAt: Date.now(),
        ...change,
    }
}

describe('platform credit administration', () => {
    it('authorizes the route before requesting organization or balance', async () => {
        const { fetch } = renderCredits({ capabilities: ['billing.manage'] })
        await screen.findByRole('heading', { name: 'Access denied' }, { timeout: 5000 })
        expect(requests(fetch, 'GET')).toHaveLength(0)
        expect(fetch.mock.calls.some(([request]) => new URL(request.url).pathname === detail)).toBe(false)
    })
    it('returns malformed route IDs to the directory without API requests', async () => {
        const { fetch } = renderCredits({ entry: '/app/platform/organizations/not-a-uuid/credits' })
        await screen.findByText('Organization directory')
        expect(fetch.mock.calls).toHaveLength(1)
    })
    it.each([404, 403, 500])('does not read or reveal a balance when organization detail returns %s', async status => {
        const { fetch } = renderCredits({
            intercept: request =>
                new URL(request.url).pathname === detail ? new Response(null, { status }) : undefined,
        })
        await screen.findByText(
            status === 404
                ? copy.missing
                : status === 403
                  ? 'Your account does not have access to this operation. Return to your workspace or contact your organization administrator.'
                  : copy.unavailable,
        )
        expect(requests(fetch, 'GET')).toHaveLength(0)
        expect(screen.queryByText(copy.current)).not.toBeInTheDocument()
    })
    it('loads authoritative organization detail before reading balance on a fresh route', async () => {
        const delayed = deferred<Response>()
        const { fetch } = renderCredits({
            intercept: request => (new URL(request.url).pathname === detail ? delayed.promise : undefined),
        })
        await screen.findByText('Loading…')
        expect(requests(fetch, 'GET')).toHaveLength(0)
        await act(async () => {
            delayed.resolve(Response.json(organization))
            await delayed.promise
        })
        await screen.findByText(copy.current)
        expect(screen.getByRole('region', { name: copy.balance })).toHaveTextContent('100')
        expect(requests(fetch, 'GET')).toHaveLength(1)
        expect(document.title).toBe('Organization credits | Lead Email Finder')
    })
    it('revalidates cached organization detail before balance on an in-app revisit', async () => {
        let revisit = false
        const delayed = deferred<Response>()
        const { fetch, router } = renderCredits({
            intercept: request => (revisit && new URL(request.url).pathname === detail ? delayed.promise : undefined),
        })
        await screen.findByText(copy.current)
        expect(requests(fetch, 'GET')).toHaveLength(1)
        await act(() => router.navigate('/outside'))
        revisit = true
        await act(() => router.navigate(route))
        expect(requests(fetch, 'GET')).toHaveLength(1)
        expect(screen.queryByText(copy.current)).not.toBeInTheDocument()
        await act(async () => {
            delayed.resolve(new Response(null, { status: 404 }))
            await delayed.promise
        })
        await screen.findByText(copy.missing)
        expect(requests(fetch, 'GET')).toHaveLength(1)
    })
    it('normalizes an uppercase UUID before requesting authoritative detail and balance', async () => {
        const { fetch } = renderCredits({
            entry: `/app/platform/organizations/${organization.id.toUpperCase()}/credits`,
        })
        await screen.findByText(copy.current)
        expect(fetch.mock.calls.some(([request]) => new URL(request.url).pathname === detail)).toBe(true)
        expect(requests(fetch, 'GET')).toHaveLength(1)
    })
    it('does not resurrect recovery after the pending addition expires the session', async () => {
        const delayed = deferred<Response>()
        const { session } = renderCredits({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await confirmAdjustment()
        expect(readCreditAdjustment(account.membership.id, organization.id)).not.toBeNull()
        await act(async () => {
            delayed.resolve(new Response(null, { status: 401 }))
            await delayed.promise
        })
        await waitFor(() => expect(session.getSnapshot().status).toBe('session-expired'))
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
    })
    it('clears pending recovery when a refreshed session becomes unusable and ignores late success', async () => {
        const delayed = deferred<Response>()
        let unusable = false
        const { session } = renderCredits({
            intercept: request => {
                if (request.method === 'POST') return delayed.promise
                if (unusable && new URL(request.url).pathname === '/v1/auth/session')
                    return Response.json({ code: 'human_session_required' }, { status: 403 })
            },
        })
        await confirmAdjustment()
        expect(readCreditAdjustment(account.membership.id, organization.id)).not.toBeNull()
        unusable = true
        await act(() => session.bootstrap())
        expect(session.getSnapshot().status).toBe('account-unavailable')
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
        await act(async () => {
            delayed.resolve(Response.json({ balance: 125 }, { status: 201 }))
            await delayed.promise
        })
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
    })
    it('keeps add and set distinct and focuses the invalid field without dispatching', async () => {
        const { fetch } = renderCredits()
        const add = await screen.findByRole('region', { name: copy.add })
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeEnabled())
        await userEvent.click(within(add).getByRole('button', { name: copy.reviewAdd }))
        const input = screen.getByLabelText(copy.addAmount)
        expect(input).toHaveFocus()
        expect(input).toHaveAccessibleDescription(copy.addInvalid)
        await userEvent.type(input, '2147483648')
        await userEvent.click(screen.getByRole('button', { name: copy.reviewAdd }))
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByRole('region', { name: copy.set })).toHaveTextContent(copy.setDescription)
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })
    it('creates no recovery key until confirmation and restores focus after cancellation', async () => {
        const { fetch } = renderCredits()
        const { user, dialog } = await review()
        expect(within(dialog).getByRole('button', { name: copy.cancel })).toHaveFocus()
        expect(dialog).toHaveTextContent(organization.name)
        expect(dialog).toHaveTextContent(organization.id)
        expect(dialog).toHaveTextContent('100')
        expect(dialog).toHaveTextContent('25')
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
        await user.click(within(dialog).getByRole('button', { name: copy.cancel }))
        expect(screen.getByRole('button', { name: copy.reviewAdd })).toHaveFocus()
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })
    it('persists before POST, blocks duplicate activation, and never optimistically increments balance', async () => {
        const delayed = deferred<Response>()
        let persistedBeforeSend = false
        const { fetch, session } = renderCredits({
            intercept: request => {
                if (request.method === 'POST') {
                    const record = readCreditAdjustment(account.membership.id, organization.id)
                    persistedBeforeSend = record?.key === request.headers.get('Idempotency-Key') && record.amount === 25
                    return delayed.promise
                }
            },
        })
        await confirmAdjustment()
        await screen.findByText(copy.adding)
        expect(persistedBeforeSend).toBe(true)
        expect(screen.getByRole('region', { name: copy.balance })).toHaveTextContent('100')
        expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeDisabled()
        expect(screen.getByRole('button', { name: copy.reviewSet })).toBeDisabled()
        expect(requests(fetch, 'POST')).toHaveLength(1)
        const key = requests(fetch, 'POST')[0].headers.get('Idempotency-Key')!
        expect(
            JSON.stringify(
                session.queryClient
                    .getQueryCache()
                    .getAll()
                    .map(query => query.state.data),
            ).includes(key),
        ).toBe(false)
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
        expect(document.body.textContent?.includes(key)).toBe(false)
        await act(async () => {
            delayed.resolve(Response.json({ balance: 125 }, { status: 201 }))
            await delayed.promise
        })
        await screen.findByText(copy.added)
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
        expect(requests(fetch, 'GET').length).toBeGreaterThan(1)
    })
    it('does not send an addition when synchronous recovery persistence is unavailable', async () => {
        const { fetch } = renderCredits()
        const { user, dialog } = await review()
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Unavailable')
        })
        await user.click(within(dialog).getByRole('button', { name: copy.add }))
        await screen.findByText(copy.storageFailed)
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })
    it('retries only explicitly with the same persisted key and amount after a lost response', async () => {
        let post = 0
        const { fetch } = renderCredits({
            intercept: request =>
                request.method === 'POST' && ++post === 1 ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await confirmAdjustment()
        await screen.findByText(copy.unknown)
        await waitFor(() => expect(screen.getByRole('button', { name: copy.retry })).toBeEnabled())
        expect(requests(fetch, 'POST')).toHaveLength(1)
        expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeDisabled()
        await userEvent.click(screen.getByRole('button', { name: copy.retry }))
        await screen.findByText(copy.added)
        const [first, second] = requests(fetch, 'POST')
        expect(second.headers.get('Idempotency-Key')).toBe(first.headers.get('Idempotency-Key'))
        expect(await second.clone().json()).toEqual(await first.clone().json())
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
    })
    it('restores the same-tab adjustment after fresh bootstrap without sending until explicit retry', async () => {
        const record = recovered({ state: 'pending' })
        saveCreditAdjustment(record)
        const { fetch } = renderCredits()
        await screen.findByText(copy.restored)
        expect(requests(fetch, 'POST')).toHaveLength(0)
        expect(requests(fetch, 'GET')).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: copy.retry }))
        await screen.findByText(copy.added)
        expect(requests(fetch, 'POST')[0].headers.get('Idempotency-Key')).toBe(record.key)
    })
    it('retains conflicting additions and requires acknowledged abandonment before another adjustment', async () => {
        const { fetch } = renderCredits({
            intercept: request => (request.method === 'POST' ? new Response(null, { status: 409 }) : undefined),
        })
        await confirmAdjustment()
        await waitFor(() =>
            expect(readCreditAdjustment(account.membership.id, organization.id)?.state).toBe('conflict'),
        )
        await waitFor(() => expect(screen.getByRole('button', { name: copy.abandon })).toBeEnabled())
        expect(requests(fetch, 'POST')).toHaveLength(1)
        expect(screen.queryByRole('button', { name: copy.retry })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: copy.abandon }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent(copy.abandonDescription)
        expect(dialog).toHaveTextContent(copy.recoveryLimit)
        await userEvent.click(within(dialog).getByRole('button', { name: copy.acknowledgeAbandon }))
        await screen.findByText(copy.abandoned)
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
        expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeEnabled()
    })
    it('retains expired recovery until the unknown outcome is acknowledged', async () => {
        saveCreditAdjustment(recovered({ createdAt: Date.now() - creditAdjustmentRecoveryWindowMs }))
        const { fetch } = renderCredits()
        await screen.findByText(copy.expired)
        expect(screen.queryByRole('button', { name: copy.retry })).not.toBeInTheDocument()
        expect(readCreditAdjustment(account.membership.id, organization.id)).not.toBeNull()
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })
    it('reports only the observed match after an uncertain absolute set and never retries PUT', async () => {
        const { fetch } = renderCredits({
            intercept: request =>
                request.method === 'PUT' ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await confirmAdjustment('set', '100')
        await screen.findByText(copy.setMatches)
        expect(requests(fetch, 'PUT')).toHaveLength(1)
        expect(requests(fetch, 'GET')).toHaveLength(2)
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewSet })).toBeEnabled())
        expect(readCreditAdjustment(account.membership.id, organization.id)).toBeNull()
    })
    it('requires a successful balance reload after an uncertain set before enabling another set', async () => {
        let put = false
        const { fetch } = renderCredits({
            intercept: request => {
                if (request.method === 'PUT') {
                    put = true
                    return Promise.reject(new TypeError('Lost response'))
                }
                if (put && new URL(request.url).pathname === credits) return new Response(null, { status: 500 })
            },
        })
        await confirmAdjustment('set', '0')
        await screen.findByText(copy.setUnknown)
        await screen.findByRole('button', { name: 'Try again' })
        expect(screen.getByRole('button', { name: copy.reviewSet })).toBeDisabled()
        expect(requests(fetch, 'PUT')).toHaveLength(1)
    })
    it.each([400, 403])('keeps an earlier unresolved addition after its explicit retry receives %s', async status => {
        const record = recovered()
        saveCreditAdjustment(record)
        renderCredits({
            intercept: request => (request.method === 'POST' ? new Response(null, { status }) : undefined),
        })
        await screen.findByText(copy.restored)
        await userEvent.click(screen.getByRole('button', { name: copy.retry }))
        await screen.findByText(copy.retryRejected)
        expect(readCreditAdjustment(account.membership.id, organization.id)?.key).toBe(record.key)
        expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeDisabled()
    })
    it('marks a stalled POST unknown after its deadline and retains explicit same-key recovery', async () => {
        const { fetch } = renderCredits({
            intercept: request =>
                request.method === 'POST'
                    ? new Promise<Response>((_resolve, reject) =>
                          request.signal.addEventListener('abort', () =>
                              reject(new DOMException('Request timed out.', 'TimeoutError')),
                          ),
                      )
                    : undefined,
        })
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewAdd })).toBeEnabled())
        vi.useFakeTimers()
        fireEvent.change(screen.getByLabelText(copy.addAmount), { target: { value: '25' } })
        fireEvent.click(screen.getByRole('button', { name: copy.reviewAdd }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: copy.add }))
        expect(screen.getByText(copy.adding)).toBeInTheDocument()
        await act(() => vi.advanceTimersByTimeAsync(creditRequestTimeoutMs + 10))
        expect(screen.getByText(copy.unknown)).toBeInTheDocument()
        expect(readCreditAdjustment(account.membership.id, organization.id)?.state).toBe('unknown')
        expect(requests(fetch, 'POST')).toHaveLength(1)
        expect(screen.getByRole('button', { name: copy.retry })).toBeEnabled()
    })
    it('updates recovery expiry while the page remains open without deleting the record', async () => {
        vi.useFakeTimers()
        saveCreditAdjustment(recovered({ createdAt: Date.now() - creditAdjustmentRecoveryWindowMs + 1000 }))
        renderCredits()
        await act(() => vi.advanceTimersByTimeAsync(50))
        expect(screen.getByRole('button', { name: copy.retry })).toBeEnabled()
        await act(() => vi.advanceTimersByTimeAsync(1000))
        expect(screen.getByText(copy.expired)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: copy.retry })).not.toBeInTheDocument()
        expect(readCreditAdjustment(account.membership.id, organization.id)).not.toBeNull()
    })
    it('keeps a pending addition on route departure and ignores its late response', async () => {
        const delayed = deferred<Response>()
        const { router, fetch } = renderCredits({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await confirmAdjustment()
        const key = readCreditAdjustment(account.membership.id, organization.id)?.key
        await act(() => router.navigate('/outside'))
        expect(requests(fetch, 'POST')[0].signal.aborted).toBe(true)
        await act(async () => {
            delayed.resolve(Response.json({ balance: 125 }, { status: 201 }))
            await delayed.promise
        })
        expect(readCreditAdjustment(account.membership.id, organization.id)?.key).toBe(key)
        await act(() => router.navigate(route))
        await screen.findByText(copy.restored)
        expect(requests(fetch, 'POST')).toHaveLength(1)
    })
})
