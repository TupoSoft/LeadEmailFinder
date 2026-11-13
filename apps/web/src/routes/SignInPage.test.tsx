import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../app/routes'
import { signInCopy } from '../content/auth-shell'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AuthSession } from '../features/auth/auth-session'

const NativeRequest = globalThis.Request

class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

function renderSignIn(
    path = '/sign-in',
    respond: (request: Request) => Promise<Response> = () => Promise.resolve(Response.json({ status: true })),
) {
    const fetch = vi.fn(respond)
    const session = new AuthSession({ fetch, channelFactory: () => null })
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
    const view = render(<RouterProvider router={router} />)

    return { fetch, router, ...view }
}

describe('public magic-link sign-in', () => {
    it('validates email inline with focus and field associations before making a request', async () => {
        const visitor = userEvent.setup()
        const { fetch } = renderSignIn()
        const input = screen.getByRole('textbox', { name: signInCopy.email })

        await visitor.type(input, 'not-an-address')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(screen.getByRole('alert')).toHaveTextContent(signInCopy.invalidEmail)
        expect(input).toHaveFocus()
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).toHaveAccessibleDescription(`${signInCopy.help} ${signInCopy.invalidEmail}`)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('submits normalized email once, announces pending, and shows generic check-email confirmation', async () => {
        const visitor = userEvent.setup()
        let complete!: (response: Response) => void
        const { fetch } = renderSignIn(
            '/sign-in?destination=%2Fapp%2Fbilling',
            () =>
                new Promise<Response>(resolve => {
                    complete = resolve
                }),
        )

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'Owner@Example.com')
        await visitor.dblClick(screen.getByRole('button', { name: signInCopy.submit }))

        expect(fetch).toHaveBeenCalledOnce()
        expect(screen.getByText(signInCopy.pending)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.submit })).toBeDisabled()

        const request = fetch.mock.calls[0][0]

        expect(request.method).toBe('POST')
        expect(new URL(request.url).pathname).toBe('/v1/auth/sign-in/magic-link')
        expect(request.credentials).toBe('same-origin')
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(await request.clone().json()).toEqual({ email: 'owner@example.com', callbackURL: '/app/billing' })

        act(() => complete(Response.json({ status: true })))

        expect(await screen.findByRole('heading', { name: signInCopy.checkTitle })).toBeInTheDocument()
        expect(screen.getByText(signInCopy.checkDescription)).toBeInTheDocument()
        expect(screen.getByText('owner@example.com')).toBeInTheDocument()
        expect(screen.getByText(signInCopy.checkHelp)).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(document.activeElement).toHaveTextContent('owner@example.com')
    })

    it('resends deliberately, preserves the destination, and supports changing the email', async () => {
        const visitor = userEvent.setup()
        const { fetch } = renderSignIn('/sign-in?destination=%2Fapp%2Fverifications%2Fnew')

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))
        await visitor.click(await screen.findByRole('button', { name: signInCopy.resend }))

        expect(await screen.findByText(signInCopy.resent)).toBeInTheDocument()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(await fetch.mock.calls[1][0].clone().json()).toEqual({
            email: 'owner@example.com',
            callbackURL: '/app/verifications/new',
        })

        await visitor.click(screen.getByRole('button', { name: signInCopy.changeEmail }))

        const input = screen.getByRole('textbox', { name: signInCopy.email })

        expect(input).toHaveValue('owner@example.com')
        expect(input).toHaveFocus()
    })

    it.each([
        'https://evil.example/app',
        '//evil.example/app',
        '/app/../auth/callback',
        '/app/session-expired',
        '/v1/auth/magic-link/verify?token=private',
    ])('replaces unsafe return destination %s before submitting it', async destination => {
        const visitor = userEvent.setup()
        const { fetch } = renderSignIn(`/sign-in?destination=${encodeURIComponent(destination)}`)

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(await fetch.mock.calls[0][0].clone().json()).toEqual({
            email: 'owner@example.com',
            callbackURL: '/app',
        })
    })

    it.each(['invalid-link', 'TOKEN_EXPIRED', 'private-provider-error'])(
        'offers a fresh sign-in for expired or used links without reflecting error %s',
        error => {
            const { fetch } = renderSignIn(`/sign-in?error=${error}&error_description=private-token`)

            expect(screen.getByText(signInCopy.invalidLink)).toBeInTheDocument()
            expect(screen.getByRole('textbox', { name: signInCopy.email })).toBeInTheDocument()
            expect(screen.queryByText('private-token')).not.toBeInTheDocument()
            expect(screen.queryByText(error)).not.toBeInTheDocument()
            expect(fetch).not.toHaveBeenCalled()
        },
    )

    it('preserves the address after delivery failure and permits an explicit retry', async () => {
        const visitor = userEvent.setup()
        let attempts = 0
        renderSignIn('/sign-in', () => {
            attempts += 1

            return Promise.resolve(
                attempts === 1
                    ? Response.json(
                          { code: 'magic_link_delivery_failed', message: 'private-provider-error' },
                          { status: 503 },
                      )
                    : Response.json({ status: true }),
            )
        })

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(await screen.findByText(signInCopy.deliveryError)).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: signInCopy.email })).toHaveValue('owner@example.com')
        expect(screen.queryByText('private-provider-error')).not.toBeInTheDocument()

        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(await screen.findByRole('heading', { name: signInCopy.checkTitle })).toBeInTheDocument()
        expect(attempts).toBe(2)
    })

    it('keeps check-email recovery available after a resend delivery failure', async () => {
        const visitor = userEvent.setup()
        let attempts = 0
        renderSignIn('/sign-in', () => {
            attempts += 1

            return Promise.resolve(
                attempts === 1 ? Response.json({ status: true }) : Response.json({}, { status: 503 }),
            )
        })

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))
        await visitor.click(await screen.findByRole('button', { name: signInCopy.resend }))

        expect(await screen.findByText(signInCopy.deliveryError)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: signInCopy.checkTitle })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.resend })).toBeEnabled()
    })

    it('honors persistent rate-limit feedback without automatically retrying', async () => {
        const visitor = userEvent.setup()
        const { fetch } = renderSignIn('/sign-in', () =>
            Promise.resolve(Response.json({}, { status: 429, headers: { 'Retry-After': '60' } })),
        )

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(await screen.findByText(signInCopy.rateLimited)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.submit })).toBeDisabled()
        expect(fetch).toHaveBeenCalledOnce()
    })

    it('shows uncertain delivery after a transport failure without exposing its exception', async () => {
        const visitor = userEvent.setup()
        renderSignIn('/sign-in', () => Promise.reject(new Error('private-url-and-token')))

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))

        expect(await screen.findByText(signInCopy.requestError)).toBeInTheDocument()
        expect(screen.queryByText('private-url-and-token')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.submit })).toBeEnabled()
    })

    it('aborts a pending request when leaving the sign-in page', async () => {
        const visitor = userEvent.setup()
        const { fetch, unmount } = renderSignIn('/sign-in', () => new Promise(() => {}))

        await visitor.type(screen.getByRole('textbox', { name: signInCopy.email }), 'owner@example.com')
        await visitor.click(screen.getByRole('button', { name: signInCopy.submit }))
        const request = fetch.mock.calls[0][0]

        unmount()

        await waitFor(() => expect(request.signal.aborted).toBe(true))
    })

    it('bounds a stalled request and restores explicit recovery without automatically retrying', async () => {
        vi.useFakeTimers()
        const { fetch } = renderSignIn(
            '/sign-in',
            request =>
                new Promise((_resolve, reject) => {
                    request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
                }),
        )

        fireEvent.change(screen.getByRole('textbox', { name: signInCopy.email }), {
            target: { value: 'owner@example.com' },
        })
        fireEvent.click(screen.getByRole('button', { name: signInCopy.submit }))

        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000)
        })

        expect(screen.getByText(signInCopy.requestError)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.submit })).toBeEnabled()
        expect(fetch).toHaveBeenCalledOnce()
    })

    it('disables sending while offline and leaves the email available for recovery', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        const { fetch } = renderSignIn()

        expect(screen.getByText(signInCopy.offline)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: signInCopy.submit })).toBeDisabled()
        expect(screen.getByRole('textbox', { name: signInCopy.email })).toBeEnabled()
        expect(fetch).not.toHaveBeenCalled()
    })

    it('offers public sign-in from the landing page', () => {
        renderSignIn('/')

        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    })
})
