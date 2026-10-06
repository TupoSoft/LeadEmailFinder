import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../api/current-account'
import { appRoutes } from '../app/routes'
import { billingCopy } from '../content/billing'
import { productCopy } from '../content/product'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AuthSession } from '../features/auth/auth-session'
import { billingQueryKeys, type CreditPurchase } from '../features/billing/billing-api'
import { navigateToCheckout } from '../features/billing/checkout-navigation'
import type * as CheckoutNavigation from '../features/billing/checkout-navigation'
import { rememberCheckoutHint } from '../features/billing/checkout-return-hint'

vi.mock('../features/billing/checkout-navigation', async importOriginal => ({
    ...(await importOriginal<typeof CheckoutNavigation>()),
    navigateToCheckout: vi.fn(),
}))

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
    vi.mocked(navigateToCheckout).mockClear()
    sessionStorage.clear()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const account: CurrentAccount = {
    email: 'owner@example.test',
    membership: { id: 'owner-a', role: 'owner' },
    organization: { id: 'organization-a', name: 'Example workspace' },
    capabilities: ['billing.read', 'billing.manage'],
    grantableServiceClientPermissions: [],
}
const purchaseId = '12345678-1234-4234-8234-123456789012'
const pack = { id: 'starter', credits: 100, amountMinor: 500, currency: 'USD' }
const purchase: CreditPurchase = {
    id: purchaseId,
    packId: pack.id,
    credits: pack.credits,
    amountMinor: pack.amountMinor,
    currency: pack.currency,
    status: 'pending',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
}

function renderBilling({
    path = '/app/billing',
    capabilities = account.capabilities,
    intercept,
}: {
    path?: string
    capabilities?: CurrentAccount['capabilities']
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/auth/session') return Promise.resolve(Response.json({ ...account, capabilities }))
        if (path === '/v1/billing/summary')
            return Promise.resolve(Response.json({ balance: 25, reserved: 0, available: 25 }))
        if (path === '/v1/billing/credit-packs') return Promise.resolve(Response.json([pack]))
        if (path === '/v1/credit-purchases' && request.method === 'GET') return Promise.resolve(Response.json([]))
        if (path === '/v1/credit-purchases' && request.method === 'POST')
            return Promise.resolve(
                Response.json(
                    {
                        id: purchaseId,
                        status: 'pending',
                        redirectUrl: `http://localhost:53000/billing/complete?purchaseId=${purchaseId}`,
                    },
                    { status: 201 },
                ),
            )
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
                children: appRoutes[0].children,
            },
        ],
        { initialEntries: [path] },
    )
    render(<RouterProvider router={router} />)
    return { fetch, session, router }
}

function requestsFor(fetch: ReturnType<typeof renderBilling>['fetch'], path: string, method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === path && request.method === method)
}

describe('billing routes', () => {
    it('loads independent organization-scoped reads and keeps only safe projected fields in cache', async () => {
        const { fetch, session } = renderBilling({
            intercept: request => {
                const path = new URL(request.url).pathname
                if (path === '/v1/billing/credit-packs')
                    return Response.json([{ ...pack, providerPriceId: 'internal-price' }])
                if (path === '/v1/credit-purchases')
                    return Response.json([
                        {
                            ...purchase,
                            provider: 'internal-provider',
                            providerReference: 'internal-reference',
                            rawPayload: 'private-payload',
                        },
                    ])
            },
        })
        expect(await screen.findByRole('heading', { name: 'Billing' })).toBeInTheDocument()
        expect(await screen.findByText('Pending')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute('href', '/app/billing')
        expect(session.queryClient.getQueryData(billingQueryKeys.packs(account.organization.id))).toEqual([pack])
        expect(session.queryClient.getQueryData(billingQueryKeys.purchases(account.organization.id))).toEqual([
            purchase,
        ])
        expect(
            JSON.stringify(
                session.queryClient
                    .getQueryCache()
                    .getAll()
                    .map(query => query.state.data),
            ),
        ).not.toMatch(/internal-|private-payload/)
        for (const path of ['/v1/billing/summary', '/v1/billing/credit-packs', '/v1/credit-purchases']) {
            const request = requestsFor(fetch, path)[0]
            expect(new URL(request.url).search).toBe('')
            expect(request.credentials).toBe('same-origin')
        }
    })

    it('separates availability from reservations and refreshes only server-confirmed amounts', async () => {
        let summary = { balance: 10, reserved: 3, available: 7 }
        const { session } = renderBilling({
            intercept: request =>
                new URL(request.url).pathname === '/v1/billing/summary'
                    ? Response.json({ ...summary, internalLedger: 'private' })
                    : undefined,
        })
        const panel = await screen.findByRole('region', { name: 'Credit balance' })
        expect(await within(panel).findByText('7')).toBeInTheDocument()
        expect(within(panel).getByText('Available credits')).toBeInTheDocument()
        expect(within(panel).getByText('Reserved credits').nextElementSibling).toHaveTextContent('3 credits')
        expect(within(panel).getByText('Total balance').nextElementSibling).toHaveTextContent('10 credits')
        expect(within(panel).getByText(billingCopy.reservationExplanation)).toBeInTheDocument()
        expect(session.queryClient.getQueryData(billingQueryKeys.summary(account.organization.id))).toEqual(summary)
        summary = { balance: 1, reserved: 0, available: 1 }
        await act(async () => {
            await session.queryClient.invalidateQueries({ queryKey: billingQueryKeys.summary(account.organization.id) })
        })
        expect(await within(panel).findByText('1')).toBeInTheDocument()
        expect(within(panel).getByText('Reserved credits').nextElementSibling).toHaveTextContent('0 credits')
        expect(within(panel).getByText('Total balance').nextElementSibling).toHaveTextContent('1 credit')
        expect(panel.querySelector('[aria-live="polite"][aria-atomic="true"]')).toHaveTextContent('1 credit')
    })

    it('keeps catalog and history usable when balance fails, then retries only the balance', async () => {
        let failed = true
        const { fetch } = renderBilling({
            intercept: request =>
                new URL(request.url).pathname === '/v1/billing/summary' && failed
                    ? new Response(null, { status: 500 })
                    : undefined,
        })
        const balance = await screen.findByRole('region', { name: 'Credit balance' })
        expect(await within(balance).findByText(productCopy.readError)).toBeInTheDocument()
        expect(await screen.findByRole('button', { name: /Buy 100 credits/ })).toBeEnabled()
        expect(screen.getByText(billingCopy.emptyHistory)).toBeInTheDocument()
        failed = false
        await userEvent.click(within(balance).getByRole('button', { name: 'Try again' }))
        expect(await within(balance).findByText('25')).toBeInTheDocument()
        expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(2)
        expect(requestsFor(fetch, '/v1/billing/credit-packs')).toHaveLength(1)
    })

    it('allows billing readers to view data without purchase controls', async () => {
        renderBilling({ capabilities: ['billing.read'] })
        expect(await screen.findByText(billingCopy.readOnly)).toBeInTheDocument()
        expect(await screen.findByText('25')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Buy / })).not.toBeInTheDocument()
    })

    it('hides billing navigation and data when the capability is absent', async () => {
        const { fetch } = renderBilling({ capabilities: ['verification.run'] })
        expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument()
        expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(0)
    })

    it.each([401, 403])('respects an authoritative %s despite visible capabilities', async status => {
        const { router } = renderBilling({
            intercept: request =>
                new URL(request.url).pathname === '/v1/billing/summary' ? new Response(null, { status }) : undefined,
        })
        expect(
            await screen.findByRole('heading', { name: status === 401 ? 'Your session has expired' : 'Access denied' }),
        ).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(status === 401 ? '/app/session-expired' : '/app/forbidden')
    })

    it('sends only packId once through CSRF transport and navigates after confirmed success', async () => {
        let resolve!: (response: Response) => void
        const response = new Promise<Response>(done => {
            resolve = done
        })
        const { fetch } = renderBilling({ intercept: request => (request.method === 'POST' ? response : undefined) })
        const button = await screen.findByRole('button', { name: /Buy 100 credits/ })
        const user = userEvent.setup()
        await user.dblClick(button)
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
        expect(button).toBeDisabled()
        expect(navigateToCheckout).not.toHaveBeenCalled()
        const request = requestsFor(fetch, '/v1/credit-purchases', 'POST')[0]
        expect(await request.clone().json()).toEqual({ packId: 'starter' })
        expect(request.headers.get('x-csrf-token')).toBe('csrf-fixture')
        await act(() => {
            resolve(
                Response.json(
                    { id: purchaseId, status: 'pending', redirectUrl: 'http://localhost:53000/billing/complete' },
                    { status: 201 },
                ),
            )
            return response
        })
        await waitFor(() =>
            expect(navigateToCheckout).toHaveBeenCalledExactlyOnceWith(
                purchaseId,
                'http://localhost:53000/billing/complete',
            ),
        )
        expect(screen.getByText('25')).toBeInTheDocument()
        expect(screen.queryByText('125')).not.toBeInTheDocument()
    })

    it('refreshes the catalog after a rejected pack without retrying checkout', async () => {
        const { fetch } = renderBilling({
            intercept: request => (request.method === 'POST' ? new Response(null, { status: 400 }) : undefined),
        })
        await userEvent.click(await screen.findByRole('button', { name: /Buy 100 credits/ }))
        expect(await screen.findByText(billingCopy.packUnavailable)).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, '/v1/billing/credit-packs')).toHaveLength(2))
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
    })

    it('retains the request lock across route changes and never redirects an unmounted screen', async () => {
        let resolve!: (response: Response) => void
        const pending = new Promise<Response>(done => {
            resolve = done
        })
        const { fetch, router } = renderBilling({
            intercept: request => (request.method === 'POST' ? pending : undefined),
        })
        await userEvent.click(await screen.findByRole('button', { name: /Buy 100 credits/ }))
        await act(() => router.navigate('/app'))
        expect(await screen.findByRole('heading', { name: 'Your workspace' })).toBeInTheDocument()
        await act(() => router.navigate('/app/billing'))
        expect(await screen.findByRole('button', { name: /Buy 100 credits/ })).toBeDisabled()
        await act(() => router.navigate('/app'))
        await act(() => {
            resolve(
                Response.json(
                    { id: purchaseId, status: 'pending', redirectUrl: 'http://localhost:53000/billing/complete' },
                    { status: 201 },
                ),
            )
            return pending
        })
        expect(navigateToCheckout).not.toHaveBeenCalled()
        await act(() => router.navigate('/app/billing'))
        await userEvent.click(await screen.findByRole('button', { name: 'Continue to checkout' }))
        expect(navigateToCheckout).toHaveBeenCalledExactlyOnceWith(
            purchaseId,
            'http://localhost:53000/billing/complete',
        )
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
    })

    it('retains unresolved checkout recovery after leaving and reopening billing', async () => {
        let posted = false
        const { fetch, router } = renderBilling({
            intercept: request => {
                if (request.method === 'POST') {
                    posted = true
                    return Promise.reject(new Error('network'))
                }
                if (posted && new URL(request.url).pathname === '/v1/credit-purchases')
                    return new Response(null, { status: 500 })
            },
        })
        await userEvent.click(await screen.findByRole('button', { name: /Buy 100 credits/ }))
        expect(await screen.findByText(billingCopy.refreshRequired)).toBeInTheDocument()
        await act(() => router.navigate('/app'))
        await act(() => router.navigate('/app/billing'))
        expect(await screen.findByRole('button', { name: /Buy 100 credits/ })).toBeDisabled()
        expect(screen.getByText(billingCopy.refreshRequired)).toBeInTheDocument()
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
    })

    it.each([502, 0])('refreshes authoritative history and balance after checkout failure %s', async status => {
        const { fetch } = renderBilling({
            intercept: request =>
                request.method === 'POST'
                    ? status === 0
                        ? Promise.reject(new Error('private provider exception'))
                        : new Response(null, { status })
                    : undefined,
        })
        await userEvent.click(await screen.findByRole('button', { name: /Buy 100 credits/ }))
        expect(
            await screen.findByText(status === 502 ? billingCopy.checkoutUnavailable : billingCopy.uncertain),
        ).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, '/v1/credit-purchases')).toHaveLength(2))
        expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(2)
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
        expect(navigateToCheckout).not.toHaveBeenCalled()
        expect(screen.queryByText('private provider exception')).not.toBeInTheDocument()
    })

    it('requires a successful history refresh before deliberately retrying an uncertain checkout', async () => {
        let posted = false
        let historyFails = true
        const { fetch } = renderBilling({
            intercept: request => {
                if (request.method === 'POST') {
                    posted = true
                    return Promise.reject(new Error('network'))
                }
                if (posted && historyFails && new URL(request.url).pathname === '/v1/credit-purchases')
                    return new Response(null, { status: 500 })
            },
        })
        const buy = await screen.findByRole('button', { name: /Buy 100 credits/ })
        await userEvent.click(buy)
        expect(await screen.findByText(billingCopy.refreshRequired)).toBeInTheDocument()
        await waitFor(() => expect(buy).toBeDisabled())
        historyFails = false
        await userEvent.click(screen.getByRole('button', { name: 'Refresh billing' }))
        await waitFor(() => expect(buy).toBeEnabled())
        expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(1)
        await userEvent.click(buy)
        await waitFor(() => expect(requestsFor(fetch, '/v1/credit-purchases', 'POST')).toHaveLength(2))
    })

    it('rejects an unsafe checkout response and refreshes history without navigating', async () => {
        const { fetch } = renderBilling({
            intercept: request =>
                request.method === 'POST'
                    ? Response.json(
                          { id: purchaseId, status: 'pending', redirectUrl: 'https://attacker.test/private-reference' },
                          { status: 201 },
                      )
                    : undefined,
        })
        await userEvent.click(await screen.findByRole('button', { name: /Buy 100 credits/ }))
        expect(await screen.findByText(billingCopy.checkoutUnavailable)).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, '/v1/credit-purchases')).toHaveLength(2))
        expect(navigateToCheckout).not.toHaveBeenCalled()
        expect(screen.queryByText(/attacker/)).not.toBeInTheDocument()
    })

    it.each(['pending', 'paid', 'failed', 'expired'] as const)(
        'renders authoritative %s return state and focuses the notice once',
        async status => {
            rememberCheckoutHint(purchaseId)
            renderBilling({
                path: `/billing/complete?purchaseId=${purchaseId}&status=paid&balance=90000`,
                intercept: request =>
                    new URL(request.url).pathname === '/v1/credit-purchases'
                        ? Response.json([{ ...purchase, status }])
                        : undefined,
            })
            const heading = await screen.findByRole('heading', { name: billingCopy.returned[status].title })
            expect(heading.closest('section')).toHaveFocus()
            expect(screen.getByText(billingCopy.statuses[status])).toBeInTheDocument()
            expect(screen.getByText('25')).toBeInTheDocument()
            expect(screen.queryByText('90,000')).not.toBeInTheDocument()
            if (status !== 'pending')
                await waitFor(() => expect(sessionStorage.getItem('lef-checkout-return')).toBeNull())
            const refresh = screen.getByRole('button', { name: 'Refresh billing' })
            await userEvent.click(refresh)
            await waitFor(() => expect(refresh).toHaveFocus())
        },
    )

    it('shows a generic return notice for a missing or unowned hint', async () => {
        renderBilling({ path: `/billing/complete?purchaseId=${purchaseId}&status=paid&credits=90000` })
        expect(await screen.findByRole('heading', { name: 'You returned from checkout' })).toBeInTheDocument()
        expect(await screen.findByText(billingCopy.emptyHistory)).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Payment confirmed' })).not.toBeInTheDocument()
    })

    it('preserves last successful data when a later summary read fails', async () => {
        let fail = false
        renderBilling({
            path: '/billing/complete',
            intercept: request =>
                fail && new URL(request.url).pathname === '/v1/billing/summary'
                    ? new Response(null, { status: 500 })
                    : undefined,
        })
        expect(await screen.findByText('25')).toBeInTheDocument()
        fail = true
        await userEvent.click(screen.getByRole('button', { name: 'Refresh billing' }))
        const balance = screen.getByRole('region', { name: 'Credit balance' })
        expect(await within(balance).findByText(productCopy.readError)).toBeInTheDocument()
        expect(within(balance).getByText('25')).toBeInTheDocument()
    })

    it('paginates the complete history without hiding dates, amounts, or statuses', async () => {
        renderBilling({
            intercept: request =>
                new URL(request.url).pathname === '/v1/credit-purchases'
                    ? Response.json(
                          Array.from({ length: 11 }, (_, index) => ({ ...purchase, id: `purchase-${index}` })),
                      )
                    : undefined,
        })
        expect(await screen.findByText('Purchases 1–10 of 11')).toBeInTheDocument()
        expect(screen.getAllByRole('row')).toHaveLength(11)
        await userEvent.click(screen.getByRole('button', { name: 'Next purchases' }))
        expect(await screen.findByText('Purchases 11–11 of 11')).toBeInTheDocument()
        expect(screen.getAllByRole('row')).toHaveLength(2)
    })

    it('announces offline recovery and prevents checkout while offline', async () => {
        renderBilling()
        const buy = await screen.findByRole('button', { name: /Buy 100 credits/ })
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        expect(screen.getByText(billingCopy.offline)).toBeInTheDocument()
        expect(buy).toBeDisabled()
    })
})
