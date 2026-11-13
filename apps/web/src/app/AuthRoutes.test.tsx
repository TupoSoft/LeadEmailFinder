import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../api/current-account'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AuthSession } from '../features/auth/auth-session'
import { appRoutes } from './routes'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => vi.unstubAllGlobals())

const account: CurrentAccount = {
    user: { id: 'user-a', name: 'Example user', email: 'owner@example.test', emailVerified: true, image: null },
}

function renderRoute(
    path = '/app',
    respond: (request: Request) => Promise<Response> = () => Promise.resolve(Response.json(account)),
) {
    const fetch = vi.fn(respond)
    const session = new AuthSession({
        fetch,
        channelFactory: () => null,
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

// API responses below exercise the real provider, generation boundary and route composition.
describe('application routes', () => {
    it('shows personal account context and tools and a working sign-out after bootstrap', async () => {
        const user = userEvent.setup()
        const { fetch } = renderRoute('/app', request =>
            Promise.resolve(request.method === 'POST' ? Response.json({ success: true }) : Response.json(account)),
        )
        expect(await screen.findByRole('heading', { name: 'Your workspace' })).toBeInTheDocument()
        expect(screen.getAllByText(account.user.email)).toHaveLength(2)
        expect(screen.getByText('Run verifications')).toBeInTheDocument()
        expect(screen.queryByText('Manage team members')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Sign out' }))
        expect(await screen.findByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
        expect(screen.queryByText(account.user.email)).not.toBeInTheDocument()
        const request = fetch.mock.calls.find(([request]) => request.method === 'POST')?.[0]
        expect(request?.credentials).toBe('same-origin')
        expect(request?.headers.get('content-type')).toBe('application/json')
        expect(await request?.clone().json()).toEqual({})
    })

    it('shows the account name without displaying user IDs', async () => {
        renderRoute('/app')
        expect(await screen.findAllByText(account.user.name)).toHaveLength(2)
        expect(screen.queryByText(account.user.id)).not.toBeInTheDocument()
    })

    it('keeps an unauthenticated visitor in a stable recovery screen', async () => {
        const { fetch, router } = renderRoute('/app', () =>
            Promise.resolve(Response.json({ code: 'authentication_required' }, { status: 401 })),
        )

        expect(await screen.findByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
        expect(screen.getByText(/Sign in with an email link/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Check session' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?destination=%2Fapp')
        expect(router.state.location.pathname).toBe('/app')
        expect(fetch).toHaveBeenCalledOnce()
    })

    it('preserves a safe destination on expired recovery and hides account data', async () => {
        let expired = false
        const { session, router } = renderRoute('/app?view=activity', () =>
            Promise.resolve(
                expired ? Response.json({ code: 'authentication_required' }, { status: 401 }) : Response.json(account),
            ),
        )
        await screen.findByRole('heading', { name: 'Your workspace' })
        expired = true
        await act(() => session.bootstrap())
        expect(await screen.findByRole('heading', { name: 'Your session has expired' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/app/session-expired')
        expect(screen.getByRole('button', { name: 'Check session' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/sign-in?destination=%2Fapp%3Fview%3Dactivity',
        )
        expect(screen.queryByText(account.user.email)).not.toBeInTheDocument()
    })

    it('distinguishes unusable account context from a feature permission denial', async () => {
        const { router } = renderRoute('/app', () =>
            Promise.resolve(Response.json({ code: 'email_verification_required' }, { status: 403 })),
        )
        expect(await screen.findByRole('heading', { name: 'Account unavailable' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/app/account-unavailable')
        expect(screen.queryByRole('heading', { name: 'Access denied' })).not.toBeInTheDocument()
    })

    it('offers an explicit retry after an ambiguous sign-out and does not retain account data', async () => {
        const user = userEvent.setup()
        let posts = 0
        renderRoute('/app', request => {
            if (request.method === 'GET') return Promise.resolve(Response.json(account))
            posts += 1
            return posts === 1
                ? Promise.reject(new Error('network unavailable'))
                : Promise.resolve(Response.json({ success: true }))
        })
        await screen.findByRole('heading', { name: 'Your workspace' })
        await user.click(screen.getByRole('button', { name: 'Sign out' }))
        expect(await screen.findByRole('heading', { name: 'Sign-out could not be confirmed' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Check session' })).toBeInTheDocument()
        expect(screen.queryByText(account.user.email)).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Retry sign-out' }))
        expect(await screen.findByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
        expect(posts).toBe(2)
    })

    it('keeps forbidden recovery in the authenticated shell', async () => {
        renderRoute('/app/forbidden')
        expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute('href', '/app')
    })

    it.each([
        '/app/does-not-exist',
        '/app/team',
        '/app/service-clients',
        '/app/platform/organizations',
        '/app/platform/proxies',
        '/app/platform/organizations/organization-a/credits',
        '/app/verifications/batches/new',
        '/app/verifications/batches/batch-a',
    ])('handles unavailable protected path %s with a working recovery', async path => {
        renderRoute(path)
        expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
        expect(screen.getAllByRole('main')).toHaveLength(1)
        expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute('href', '/app')
    })

    it.each([
        'login_state_invalid',
        'authorization_code_exchange_failed',
        'active_membership_required',
        'raw-secret-provider-error',
    ])('renders sanitized callback code %s without an API request', async code => {
        const { fetch } = renderRoute(`/auth/error?code=${code}&error_description=private-provider-message`)
        expect(screen.getByRole('heading', { name: 'Sign-in did not complete' })).toBeInTheDocument()
        expect(screen.queryByText('private-provider-message')).not.toBeInTheDocument()
        expect(screen.queryByText('raw-secret-provider-error')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Check session' })).toBeInTheDocument()
        await waitFor(() => expect(fetch).not.toHaveBeenCalled())
    })
})
