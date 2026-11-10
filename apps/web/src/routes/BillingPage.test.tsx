import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../api/current-account'
import { appRoutes } from '../app/routes'
import { billingCopy } from '../content/billing'
import { productCopy } from '../content/product'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AuthSession } from '../features/auth/auth-session'
import { billingQueryKeys } from '../features/billing/billing-api'
const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
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

    it('retries a failed balance read', async () => {
        let failed = true
        const { fetch } = renderBilling({
            intercept: request =>
                new URL(request.url).pathname === '/v1/billing/summary' && failed
                    ? new Response(null, { status: 500 })
                    : undefined,
        })
        const balance = await screen.findByRole('region', { name: 'Credit balance' })
        expect(await within(balance).findByText(productCopy.readError)).toBeInTheDocument()
        failed = false
        await userEvent.click(within(balance).getByRole('button', { name: 'Try again' }))
        expect(await within(balance).findByText('25')).toBeInTheDocument()
        expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(2)
    })

    it('allows billing readers to view data without purchase controls', async () => {
        renderBilling({ capabilities: ['billing.read'] })
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

    it('preserves last successful data when a later summary read fails', async () => {
        let fail = false
        renderBilling({
            intercept: request =>
                fail && new URL(request.url).pathname === '/v1/billing/summary'
                    ? new Response(null, { status: 500 })
                    : undefined,
        })
        expect(await screen.findByText('25')).toBeInTheDocument()
        fail = true
        await userEvent.click(screen.getByRole('button', { name: 'Refresh balance' }))
        const balance = screen.getByRole('region', { name: 'Credit balance' })
        expect(await within(balance).findByText(productCopy.readError)).toBeInTheDocument()
        expect(within(balance).getByText('25')).toBeInTheDocument()
    })

    it('announces offline recovery', async () => {
        renderBilling()
        await screen.findByText('25')
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))

        expect(screen.getByText(billingCopy.offline)).toBeInTheDocument()
    })
})
