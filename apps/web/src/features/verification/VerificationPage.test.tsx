import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication, SessionExpiredPage } from '../../app/AuthRoutes'
import { VerificationJobPage } from '../../routes/VerificationJobPage'
import { VerificationPage } from '../../routes/VerificationPage'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { verificationQueryKeys, type VerificationOperation, type VerificationResult } from './verification-api'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    onlineManager.setOnline(true)
})

const account: CurrentAccount = {
    user: { id: 'user-a', name: 'Example user', email: 'owner@example.test', emailVerified: true, image: null },
}
const jobId = '12345678-1234-4234-8234-123456789012'
const createPath = '/v1/email-verifications'
const statusPath = `${createPath}/${jobId}`
const formRoute = '/app/verifications/new'
const jobRoute = `/app/verifications/${jobId}`
const result: VerificationResult = {
    id: '87654321-4321-4321-8321-210987654321',
    email: 'person@lef.test',
    localPart: 'person',
    domain: 'lef.test',
    exists: true,
    catchAll: false,
    reason: 'accepted_email',
    sources: ['mx'],
}

const operation: VerificationOperation = {
    id: jobId,
    source: 'fresh',
    observedAt: '2026-09-15T12:00:00.000Z',
    cacheExpiresAt: '2026-09-16T12:00:00.000Z',
    billing: { state: 'settled', reserved: 0, charged: 1, reason: 'conclusive' },
}

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}

function renderVerification({
    path = formRoute,
    intercept,
}: {
    path?: string
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/me') return Promise.resolve(Response.json(account))
        if (path === createPath && request.method === 'POST')
            return Promise.resolve(Response.json({ id: jobId }, { status: 202 }))
        if (path === statusPath) return Promise.resolve(Response.json({ state: 'queued' }))
        if (path === '/v1/auth/sign-out') return Promise.resolve(Response.json({ success: true }))
        return Promise.resolve(new Response(null, { status: 404 }))
    })
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
                children: [
                    {
                        element: <ProtectedApplication />,
                        children: [
                            { path: formRoute, element: <VerificationPage /> },
                            { path: '/app/verifications/:id', element: <VerificationJobPage /> },
                            { path: '/app/forbidden', element: <ForbiddenPage /> },
                            { path: '/app/session-expired', element: <SessionExpiredPage /> },
                        ],
                    },
                    { path: '/outside', element: <p>Outside verification</p> },
                ],
            },
        ],
        { initialEntries: [path] },
    )
    const view = render(<RouterProvider router={router} />)
    return { fetch, session, router, ...view }
}

function requestsFor(fetch: ReturnType<typeof renderVerification>['fetch'], path: string, method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === path && request.method === method)
}

async function submit() {
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Email address' }), result.email)
    await user.click(screen.getByRole('button', { name: 'Verify email' }))
    return user
}

describe('single verification submission', () => {
    it('offers submission and navigation for a verified personal account', async () => {
        renderVerification()
        expect(await screen.findByRole('textbox', { name: 'Email address' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Verify an email/ })).toBeInTheDocument()
    })

    it('focuses an associated invalid email error without submitting', async () => {
        const { fetch } = renderVerification()
        await userEvent.click(await screen.findByRole('button', { name: 'Verify email' }))
        const email = screen.getByRole('textbox', { name: 'Email address' })
        expect(email).toHaveFocus()
        expect(email).toHaveAttribute('type', 'email')
        expect(email).toHaveAttribute('aria-invalid', 'true')
        expect(email).toHaveAccessibleDescription(/email/i)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
    })

    it('explains the credit consequence and submits once through CSRF transport before navigating', async () => {
        const delayed = deferred<Response>()
        const { fetch, router } = renderVerification({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        const user = userEvent.setup()
        await user.type(await screen.findByRole('textbox', { name: 'Email address' }), result.email)
        expect(screen.getByText(/new conclusive result costs one credit/i)).toBeInTheDocument()
        const button = screen.getByRole('button', { name: 'Verify email' })
        await user.dblClick(button)
        expect(button).toBeDisabled()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
        expect(router.state.location.pathname).toBe(formRoute)
        const request = requestsFor(fetch, createPath, 'POST')[0]
        expect(await request.clone().json()).toEqual({ email: result.email })
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.get('Idempotency-Key')).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
        expect(request.credentials).toBe('same-origin')
        expect(new URL(request.url).search).toBe('')
        await act(async () => {
            delayed.resolve(Response.json({ id: jobId }, { status: 202 }))
            await delayed.promise
        })
        expect(await screen.findByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(jobRoute)
        expect(router.state.location.search).toBe('')
        expect(requestsFor(fetch, '/verify', 'POST')).toHaveLength(0)
        expect(document.title).not.toContain(result.email)
    })

    it('keeps the email and focuses server-side validation without exposing server text', async () => {
        const { fetch } = renderVerification({
            intercept: request =>
                request.method === 'POST'
                    ? Response.json({ message: 'private validation internals' }, { status: 400 })
                    : undefined,
        })
        await submit()
        const email = screen.getByRole('textbox', { name: 'Email address' })
        await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'))
        expect(email).toHaveFocus()
        expect(email).toHaveValue(result.email)
        expect(screen.queryByText(/private validation internals/)).not.toBeInTheDocument()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('explains a rejected request clock without marking the email invalid and retries deliberately with a corrected key', async () => {
        const serverTime = Date.parse('2026-09-16T12:00:00.000Z')
        const clock = vi.spyOn(Date, 'now').mockReturnValue(serverTime + 600_000)
        let rejected = true
        const { fetch } = renderVerification({
            intercept: request =>
                request.method === 'POST' && rejected
                    ? Response.json(
                          { statusCode: 400, message: 'idempotency_key_too_far_ahead', details: 'private-details' },
                          { status: 400 },
                      )
                    : undefined,
        })
        const user = await submit()
        expect(await screen.findByRole('heading', { name: 'Check your device clock' })).toBeInTheDocument()
        expect(screen.getByText(/correct your device's date and time.*Verify email again/)).toBeInTheDocument()
        const email = screen.getByRole('textbox', { name: 'Email address' })
        expect(email).toHaveValue(result.email)
        expect(email).toHaveAttribute('aria-invalid', 'false')
        expect(email).not.toHaveAttribute('readonly')
        expect(screen.queryByText(/Enter a valid email address/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Recover submission' })).not.toBeInTheDocument()
        expect(screen.queryByText(/private-details/)).not.toBeInTheDocument()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
        clock.mockReturnValue(serverTime)
        rejected = false
        await user.click(screen.getByRole('button', { name: 'Verify email' }))
        expect(await screen.findByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        const [original, corrected] = requestsFor(fetch, createPath, 'POST')
        expect(corrected.headers.get('Idempotency-Key')).not.toBe(original.headers.get('Idempotency-Key'))
        expect(Number.parseInt(corrected.headers.get('Idempotency-Key')!.replaceAll('-', '').slice(0, 12), 16)).toBe(
            serverTime,
        )
        expect(await corrected.clone().json()).toEqual({ email: result.email })
    })

    it('offers billing recovery after insufficient credit', async () => {
        renderVerification({
            intercept: request => (request.method === 'POST' ? new Response(null, { status: 402 }) : undefined),
        })
        await submit()
        expect(await screen.findByRole('heading', { name: 'Insufficient credits' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue(result.email)
        expect(screen.getAllByRole('link').some(link => link.getAttribute('href') === '/app/billing')).toBe(true)
    })

    it.each([0, 500, 504])(
        'recovers uncertain submission %s only by deliberately reusing its address and key',
        async status => {
            const { fetch, router } = renderVerification({
                intercept: request =>
                    request.method === 'POST'
                        ? status === 0
                            ? Promise.reject(new Error('private SMTP/provider details'))
                            : new Response(null, { status })
                        : undefined,
            })
            const user = await submit()
            const button = await screen.findByRole('button', { name: 'Recover submission' })
            expect(button).toBeEnabled()
            expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue(result.email)
            expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute('readonly')
            expect(screen.getByText(/could not confirm|could not be confirmed/i)).toBeInTheDocument()
            expect(screen.queryByText(/private SMTP/)).not.toBeInTheDocument()
            expect(router.state.location.pathname).toBe(formRoute)
            expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
            await user.click(button)
            await waitFor(() => expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(2))
            const [original, recovery] = requestsFor(fetch, createPath, 'POST')
            expect(recovery.headers.get('Idempotency-Key')).toBe(original.headers.get('Idempotency-Key'))
            expect(await recovery.clone().json()).toEqual(await original.clone().json())
            expect(await screen.findByRole('button', { name: 'Recover submission' })).toBeEnabled()
        },
    )

    it.each([401, 403])('uses session recovery for authoritative submission rejection %s', async status => {
        const { router } = renderVerification({
            intercept: request => (request.method === 'POST' ? new Response(null, { status }) : undefined),
        })
        await submit()
        expect(
            await screen.findByRole('heading', { name: status === 401 ? 'Your session has expired' : 'Access denied' }),
        ).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(status === 401 ? '/app/session-expired' : '/app/forbidden')
    })

    it('treats a malformed successful submission response as uncertain without inventing a job ID', async () => {
        const { fetch, router } = renderVerification({
            intercept: request =>
                request.method === 'POST' ? Response.json({ id: 'unsafe-job-id' }, { status: 202 }) : undefined,
        })
        await submit()
        expect(await screen.findByRole('button', { name: 'Recover submission' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(formRoute)
        expect(requestsFor(fetch, `${createPath}/unsafe-job-id`)).toHaveLength(0)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('retains the pending lock across navigation and never navigates an unmounted form', async () => {
        const delayed = deferred<Response>()
        const { fetch, router } = renderVerification({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await submit()
        await act(() => router.navigate('/outside'))
        await act(() => router.navigate(formRoute))
        expect(await screen.findByRole('button', { name: /verif/i })).toBeDisabled()
        await act(() => router.navigate('/outside'))
        await act(async () => {
            delayed.resolve(Response.json({ id: jobId }, { status: 202 }))
            await delayed.promise
        })
        expect(screen.getByText('Outside verification')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/outside')
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('preserves keyed recovery and the original input across leaving and reopening the form', async () => {
        const { fetch, router } = renderVerification({
            intercept: request => (request.method === 'POST' ? Promise.reject(new Error('disconnected')) : undefined),
        })
        await submit()
        expect(await screen.findByRole('button', { name: 'Recover submission' })).toBeInTheDocument()
        await act(() => router.navigate('/outside'))
        await act(() => router.navigate(formRoute))
        expect(await screen.findByRole('button', { name: 'Recover submission' })).toBeEnabled()
        expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue(result.email)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('respects the retry time after correcting the device clock and resubmits only after a deliberate click', async () => {
        const initialClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-16T12:10:00.000Z'))
        const { fetch } = renderVerification({
            intercept: request =>
                request.method === 'POST'
                    ? new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
                    : undefined,
        })
        await userEvent.type(await screen.findByRole('textbox', { name: 'Email address' }), result.email)
        initialClock.mockRestore()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'))
        act(() => screen.getByRole('button', { name: 'Verify email' }).click())
        await tick(5)
        const retry = screen.getByRole('button', { name: 'Retry verification' })
        expect(retry).toBeDisabled()
        expect(screen.getByText(/Sep 16, 2026, 12:00:30 PM UTC/)).toBeInTheDocument()
        await tick(29_000)
        expect(retry).toBeDisabled()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
        await tick(1001)
        expect(retry).toBeEnabled()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
        act(() => retry.click())
        await tick(5)
        const [original, recovery] = requestsFor(fetch, createPath, 'POST')
        expect(recovery.headers.get('Idempotency-Key')).toBe(original.headers.get('Idempotency-Key'))
        expect(await recovery.clone().json()).toEqual({ email: result.email })
    })

    it('clears stored inputs and blocks late submissions after principal replacement', async () => {
        const delayed = deferred<Response>()
        let replacement = false
        const { fetch, session, router } = renderVerification({
            intercept: request => {
                const path = new URL(request.url).pathname
                if (path === createPath) return delayed.promise
                if (path === '/v1/me' && replacement)
                    return Response.json({
                        ...account,
                        user: { ...account.user, id: 'user-b' },
                    })
            },
        })
        await submit()
        expect(session.queryClient.getQueryData(verificationQueryKeys.submission(account.user.id))).toMatchObject({
            phase: 'pending',
            request: { email: result.email },
        })
        replacement = true
        await act(() => session.bootstrap())
        expect(await screen.findByRole('textbox', { name: 'Email address' })).toHaveValue('')
        await act(async () => {
            delayed.resolve(Response.json({ id: jobId }, { status: 202 }))
            await delayed.promise
        })
        expect(router.state.location.pathname).toBe(formRoute)
        expect(session.queryClient.getQueryData(verificationQueryKeys.submission(account.user.id))).toBeUndefined()
        expect(requestsFor(fetch, statusPath)).toHaveLength(0)
    })

    it('requires a separate new action when the server says keyed recovery has expired', async () => {
        const { fetch } = renderVerification({
            intercept: request => (request.method === 'POST' ? new Response(null, { status: 410 }) : undefined),
        })
        const user = await submit()
        expect(await screen.findByRole('heading', { name: 'Recovery has expired' })).toBeInTheDocument()
        expect(screen.getByText(/previous charge is unknown/i)).toBeInTheDocument()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
        await user.click(screen.getByRole('button', { name: 'Start a new verification' }))
        expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('')
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('disables submission offline and clears authenticated state before a late submission resolves', async () => {
        const delayed = deferred<Response>()
        const { fetch, session, router } = renderVerification({
            intercept: request => (new URL(request.url).pathname === createPath ? delayed.promise : undefined),
        })
        const online = vi.spyOn(navigator, 'onLine', 'get')
        const button = await screen.findByRole('button', { name: 'Verify email' })
        online.mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        expect(button).toBeDisabled()
        expect(screen.getByText(/offline/i)).toBeInTheDocument()
        online.mockReturnValue(true)
        await act(() => window.dispatchEvent(new Event('online')))
        await submit()
        await act(() => session.signOut())
        await act(async () => {
            delayed.resolve(Response.json({ id: jobId }, { status: 202 }))
            await delayed.promise
        })
        expect(await screen.findByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(formRoute)
        expect(session.queryClient.getQueryData(verificationQueryKeys.submission(account.user.id))).toBeUndefined()
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
        expect(requestsFor(fetch, statusPath)).toHaveLength(0)
    })
})

describe('single verification job status', () => {
    it.each([
        ['fresh', 'conclusive', 1, 'New verification', '1 credit charged'],
        ['cache', 'cached', 0, 'Cached result', 'No credits charged'],
        ['shared', 'shared', 0, 'Shared verification', 'No credits charged'],
        ['fresh', 'inconclusive', 0, 'New verification', 'No credits charged'],
    ] as const)(
        'shows authoritative %s/%s billing with evidence times',
        async (source, reason, charged, sourceLabel, chargeLabel) => {
            const { fetch, session } = renderVerification({
                path: jobRoute,
                intercept: request =>
                    new URL(request.url).pathname === statusPath
                        ? Response.json({
                              state: 'completed',
                              result,
                              operation: {
                                  ...operation,
                                  source,
                                  billing: { state: 'settled', reserved: 0, charged, reason },
                                  private: 'private-provider-detail',
                              },
                          })
                        : new URL(request.url).pathname === '/v1/billing/summary'
                          ? Response.json({ balance: 10, available: 10, reserved: 0 })
                          : undefined,
            })
            expect(await screen.findByText(chargeLabel)).toBeInTheDocument()
            expect(screen.getByText(sourceLabel)).toBeInTheDocument()
            expect(screen.getByText('Sep 15, 2026, 12:00:00 PM UTC')).toBeInTheDocument()
            expect(screen.getByText('Sep 16, 2026, 12:00:00 PM UTC')).toBeInTheDocument()
            expect(screen.getByRole('region', { name: 'Verification charges' })).toHaveAttribute('aria-live', 'polite')
            await waitFor(() => expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(1))
            expect(
                JSON.stringify(session.queryClient.getQueryData(verificationQueryKeys.job(account.user.id, jobId))),
            ).not.toContain('private-provider-detail')
        },
    )

    it('keeps pending reservations separate from final charges and refreshes server balances after settlement', async () => {
        let settled = false
        const { fetch } = renderVerification({
            path: jobRoute,
            intercept: request => {
                const path = new URL(request.url).pathname
                if (path === statusPath)
                    return Response.json({
                        state: 'completed',
                        result,
                        operation: {
                            ...operation,
                            billing: settled ? operation.billing : { state: 'pending', reserved: 1, charged: 0 },
                        },
                    })
                if (path === '/v1/billing/summary')
                    return Response.json({ balance: 10, available: 9, reserved: settled ? 0 : 1 })
            },
        })
        expect(await screen.findByText('Settlement pending')).toBeInTheDocument()
        expect(screen.getByText('1 credit initially reserved')).toBeInTheDocument()
        expect(screen.getByText('Final charge pending')).toBeInTheDocument()
        expect(screen.queryByText('No credits charged')).not.toBeInTheDocument()
        settled = true
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
        expect(await screen.findByText('1 credit charged')).toBeInTheDocument()
        expect(screen.getByText('0 credits initially reserved')).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(2))
    })

    it('labels a released reservation as historical and preserves focus on manual completion', async () => {
        let completed = false
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json(
                          completed
                              ? {
                                    state: 'completed',
                                    result,
                                    operation: {
                                        ...operation,
                                        billing: { state: 'settled', reserved: 1, charged: 0, reason: 'inconclusive' },
                                    },
                                }
                              : { state: 'running' },
                      )
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification running' })).toBeInTheDocument()
        completed = true
        const refresh = screen.getByRole('button', { name: 'Refresh status' })
        await userEvent.click(refresh)
        expect(await screen.findByText('No credits charged')).toBeInTheDocument()
        expect(screen.getByText('Original reservation')).toBeInTheDocument()
        expect(screen.getByText('1 credit initially reserved')).toBeInTheDocument()
        expect(screen.queryByText('1 credit reserved')).not.toBeInTheDocument()
        expect(refresh).toHaveFocus()
    })

    it.each([undefined, { ...operation, billing: { state: 'settled', charged: -1, reserved: 0 } }])(
        'preserves charge uncertainty for missing or invalid metadata',
        async metadata => {
            renderVerification({
                path: jobRoute,
                intercept: request =>
                    new URL(request.url).pathname === statusPath
                        ? Response.json({ state: 'completed', result, operation: metadata })
                        : undefined,
            })
            expect(await screen.findByText('Charge details unavailable')).toBeInTheDocument()
            expect(screen.queryByText('No credits charged')).not.toBeInTheDocument()
        },
    )

    it('lets a zero-available-credit account submit cached work and displays its server-confirmed free result', async () => {
        const { fetch } = renderVerification({
            intercept: request => {
                const path = new URL(request.url).pathname
                if (path === statusPath)
                    return Response.json({
                        state: 'completed',
                        result,
                        operation: {
                            ...operation,
                            source: 'cache',
                            billing: { state: 'settled', charged: 0, reserved: 0, reason: 'cached' },
                        },
                    })
                if (path === '/v1/billing/summary') return Response.json({ balance: 0, available: 0, reserved: 0 })
            },
        })
        await submit()
        expect(await screen.findByText('No credits charged')).toBeInTheDocument()
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(1)
    })

    it('requests personal job data for a verified user', async () => {
        const { fetch } = renderVerification({ path: jobRoute })
        expect(await screen.findByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
    })

    it('restores the bookmarked job using only its user-scoped status query', async () => {
        const { fetch, session } = renderVerification({ path: jobRoute })
        expect(await screen.findByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
        expect(session.queryClient.getQueryData(verificationQueryKeys.job(account.user.id, jobId))).toEqual({
            state: 'queued',
        })
    })

    it('rejects malformed route IDs before making a status request', async () => {
        const { fetch } = renderVerification({ path: '/app/verifications/not-a-uuid' })
        expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument()
        expect(requestsFor(fetch, `${createPath}/not-a-uuid`)).toHaveLength(0)
    })

    it('renders an user-concealed 404 without details or automatic resubmission', async () => {
        const { fetch } = renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ message: 'belongs to private organization' }, { status: 404 })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument()
        expect(screen.queryByText(/private organization/)).not.toBeInTheDocument()
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
    })

    it.each([401, 403])('uses shared recovery for authoritative status rejection %s', async status => {
        const { router } = renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath ? new Response(null, { status }) : undefined,
        })
        expect(
            await screen.findByRole('heading', { name: status === 401 ? 'Your session has expired' : 'Access denied' }),
        ).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(status === 401 ? '/app/session-expired' : '/app/forbidden')
    })

    it.each([
        ['queued', 'Verification queued'],
        ['running', 'Verification running'],
        ['failed', 'Verification failed'],
        ['unavailable', 'Verification unavailable'],
    ])('renders safe and distinct %s status', async (state, heading) => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({
                          state,
                          failureCode: 'verification_failed',
                          failedReason: 'private queue failure',
                      })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
        expect(screen.queryByText(/private queue failure/)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeInTheDocument()
        if (state === 'unavailable')
            expect(screen.queryByRole('heading', { name: 'Verification failed' })).not.toBeInTheDocument()
    })

    it.each([
        [true, 'Yes'],
        [false, 'No'],
        [null, 'Unknown'],
    ])('preserves %s existence and catch-all signals as %s', async (value, label) => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result: { ...result, exists: value, catchAll: value } })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification completed' })).toBeInTheDocument()
        expect(screen.getAllByText(label)).toHaveLength(2)
        expect(screen.getByText(result.email)).toBeInTheDocument()
        expect(screen.getByText(/accepted/i)).toBeInTheDocument()
        expect(screen.queryByText(/^MX domain$/)).not.toBeInTheDocument()
        expect(screen.queryByText(/^Target exchange$/)).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Verification result' })).toHaveFocus()
    })

    it('preserves the last confirmed state on read failure and recovers with GET only', async () => {
        let fail = false
        const { fetch } = renderVerification({
            path: jobRoute,
            intercept: request =>
                fail && new URL(request.url).pathname === statusPath ? new Response(null, { status: 500 }) : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        fail = true
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
        expect(await screen.findByRole('heading', { name: 'Verification status out of date' })).toBeInTheDocument()
        expect(screen.getByText('Last confirmed status: Verification queued')).toBeInTheDocument()
        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
        await waitFor(() => expect(requestsFor(fetch, statusPath)).toHaveLength(3))
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
    })

    it.each([
        ['missing result', undefined],
        ['missing required fields', {}],
        ['invalid source list', { ...result, sources: null }],
        ['invalid evidence value', { ...result, email: { private: 'private-provider-data' } }],
    ])('recovers from malformed completed data with %s on the first read', async (_name, malformed) => {
        let fail = true
        const { fetch } = renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result: fail ? malformed : result })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification status unavailable' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Verification result' })).not.toBeInTheDocument()
        expect(document.body.textContent).not.toContain('private-provider-data')
        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
        expect(await screen.findByRole('heading', { name: 'Verification completed' })).toBeInTheDocument()
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
    })

    it('preserves completed evidence and focus when a later completed response is malformed', async () => {
        let fail = false
        const { session } = renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result: fail ? {} : result })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toHaveFocus()
        fail = true
        const refresh = screen.getByRole('button', { name: 'Refresh status' })
        await userEvent.click(refresh)
        expect(await screen.findByText(/last confirmed.*out of date/i)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Verification status out of date' })).toBeInTheDocument()
        expect(screen.getByText('Last confirmed status: Verification completed')).toBeInTheDocument()
        expect(screen.getByText(result.email)).toBeInTheDocument()
        expect(refresh).toHaveFocus()
        expect(session.queryClient.getQueryData(verificationQueryKeys.job(account.user.id, jobId))).toMatchObject({
            state: 'completed',
            result,
        })
    })

    it.each(['private-unrecognized', '__proto__', 'toString'])(
        'renders unrecognized reason and source %s as Unknown without displaying raw values',
        async unknown => {
            renderVerification({
                path: jobRoute,
                intercept: request =>
                    new URL(request.url).pathname === statusPath
                        ? Response.json({
                              state: 'completed',
                              result: {
                                  ...result,
                                  reason: unknown,
                                  sources: [unknown],
                              },
                          })
                        : undefined,
            })
            expect(await screen.findByRole('heading', { name: 'Verification completed' })).toBeInTheDocument()
            expect(screen.getAllByText('Unknown')).toHaveLength(2)
            expect(document.body.textContent).not.toContain(unknown)
        },
    )

    it('focuses completion once and preserves manual refresh focus on later reads', async () => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toHaveFocus()
        const refresh = screen.getByRole('button', { name: 'Refresh status' })
        await userEvent.click(refresh)
        await waitFor(() => expect(refresh).toBeEnabled())
        expect(refresh).toHaveFocus()
    })

    it('renders an honest empty source list', async () => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result: { ...result, sources: [] } })
                    : undefined,
        })
        expect(await screen.findByText('No sources reported')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Verify another email' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeEnabled()
    })

    it('does not repopulate authenticated results when a status read finishes after sign-out', async () => {
        const delayed = deferred<Response>()
        const { fetch, session } = renderVerification({
            path: jobRoute,
            intercept: request => (new URL(request.url).pathname === statusPath ? delayed.promise : undefined),
        })
        await waitFor(() => expect(requestsFor(fetch, statusPath)).toHaveLength(1))
        await act(() => session.signOut())
        await act(async () => {
            delayed.resolve(Response.json({ state: 'completed', result }))
            await delayed.promise
        })
        expect(await screen.findByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
        expect(screen.queryByText(result.email)).not.toBeInTheDocument()
        expect(session.queryClient.getQueryData(verificationQueryKeys.job(account.user.id, jobId))).toBeUndefined()
    })

    it.each([
        ['accepted_email', /accepted the address.*not guaranteed/i],
        ['rejected_email', /rejected the address/i],
        ['timeout', /timed out/i],
        ['temporarily_blocked', /temporarily blocked/i],
        ['no_mx_records', /no mail exchange records/i],
        ['unexpected_error', /unexpected problem/i],
        ['blacklisted', /mail-server policy/i],
        ['no_connect', /connection.*could not be established/i],
        ['exceeded_storage', /storage limit/i],
        ['sender_blocked', /blocked the checking sender/i],
        ['secure_transport_unavailable', /verified secure connection/i],
        ['webmail', /webmail service.*does not confirm/i],
        ['unknown', /did not establish a reliable reason/i],
    ])('renders reviewed evidence copy for reason %s', async (reason, expected) => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state: 'completed', result: { ...result, reason } })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toBeInTheDocument()
        expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it('explains acceptance of the catch-all test address without claiming the requested mailbox exists', async () => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({
                          state: 'completed',
                          result: { ...result, exists: null, catchAll: true, sources: [] },
                      })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toBeInTheDocument()
        expect(
            screen.getByText(
                'Catch-all: the server accepted a made-up address, so we couldn’t confirm whether this specific mailbox exists.',
            ),
        ).toBeInTheDocument()
        expect(screen.getByText('Unknown', { exact: true })).toBeInTheDocument()
        expect(screen.queryByText(/accepted the address during the check/i)).not.toBeInTheDocument()
    })

    it('retains account evidence copy when discovery confirms a mailbox at a catch-all domain', async () => {
        renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({
                          state: 'completed',
                          result: { ...result, catchAll: true, reason: 'webmail', sources: ['microsoft_1'] },
                      })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toBeInTheDocument()
        expect(screen.getByText(/webmail service.*does not confirm/i)).toBeInTheDocument()
        expect(screen.getByText('Microsoft account check 1')).toBeInTheDocument()
        expect(screen.queryByText(/Catch-all: the server accepted a made-up address/i)).not.toBeInTheDocument()
    })

    it('renders all reported sources and optional fields while projecting private data out of cache', async () => {
        const { session } = renderVerification({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({
                          state: 'completed',
                          failedReason: 'private-queue-error',
                          result: {
                              ...result,
                              sources: ['mx', 'microsoft_1', 'microsoft_2', 'microsoft_4', 'mimecast', 'linkedin'],
                              format: '{first}',
                              mxDomain: 'mail.lef.test',
                              targetExchange: 'smtp.lef.test',
                              createdAt: 'private-date',
                              providerPayload: 'private-provider-payload',
                          },
                      })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Verification result' })).toBeInTheDocument()
        for (const label of [
            /mail exchange check/i,
            /Microsoft account check 1/i,
            /Microsoft account check 2/i,
            /Microsoft account check 4/i,
            /Mimecast account check/i,
            /LinkedIn/i,
            'mail.lef.test',
            'smtp.lef.test',
        ])
            expect(screen.getByText(label)).toBeInTheDocument()
        expect(
            JSON.stringify(session.queryClient.getQueryData(verificationQueryKeys.job(account.user.id, jobId))),
        ).not.toMatch(/private-/)
        expect(document.body.textContent).not.toMatch(/private-/)
    })
})

// Advance timers in act while allowing the query notifications to commit between checks.
async function tick(milliseconds = 1) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds)
    })
}

async function loadTimedJob(options: Parameters<typeof renderVerification>[0] = {}) {
    vi.useFakeTimers()
    const view = renderVerification({ path: jobRoute, ...options })
    for (let check = 0; check < 8; check += 1) await tick()
    return view
}

describe('verification polling lifecycle', () => {
    it('polls queued and running states and stops on completion', async () => {
        let checks = 0
        const { fetch } = await loadTimedJob({
            intercept: request => {
                if (new URL(request.url).pathname !== statusPath) return undefined
                checks += 1
                return Response.json(
                    checks === 1
                        ? { state: 'queued' }
                        : checks === 2
                          ? { state: 'running' }
                          : { state: 'completed', result },
                )
            },
        })
        expect(screen.getByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        await tick(5005)
        expect(screen.getByRole('heading', { name: 'Verification running' })).toBeInTheDocument()
        await tick(5005)
        expect(screen.getByRole('heading', { name: 'Verification completed' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Verification result' })).toHaveFocus()
        await tick(60_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(3)
        expect(requestsFor(fetch, createPath, 'POST')).toHaveLength(0)
    })

    it.each(['failed', 'unavailable'])('never automatically polls terminal %s state', async state => {
        const { fetch } = await loadTimedJob({
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ state, failureCode: 'verification_failed' })
                    : undefined,
        })
        expect(screen.getByRole('heading', { name: `Verification ${state}` })).toBeInTheDocument()
        await tick(60_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
    })

    it('pauses while hidden or offline and resumes without clearing the last state', async () => {
        const { fetch } = await loadTimedJob()
        const visibility = vi.spyOn(document, 'visibilityState', 'get')
        const online = vi.spyOn(navigator, 'onLine', 'get')
        visibility.mockReturnValue('hidden')
        await act(() => document.dispatchEvent(new Event('visibilitychange')))
        await tick(20_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
        expect(screen.getByRole('heading', { name: 'Verification queued' })).toBeInTheDocument()
        visibility.mockReturnValue('visible')
        await act(() => document.dispatchEvent(new Event('visibilitychange')))
        await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
        online.mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        await tick(20_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
        expect(screen.getByRole('heading', { name: 'Verification offline' })).toBeInTheDocument()
        expect(screen.getByText('Last confirmed status: Verification queued')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled()
        online.mockReturnValue(true)
        await act(() => window.dispatchEvent(new Event('online')))
        await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(3)
    })

    it('stops after a read failure and preserves the last confirmed state for manual recovery', async () => {
        let checks = 0
        const { fetch } = await loadTimedJob({
            intercept: request => {
                if (new URL(request.url).pathname !== statusPath) return undefined
                checks += 1
                return checks === 1 ? Response.json({ state: 'running' }) : new Response(null, { status: 500 })
            },
        })
        await tick(5005)
        expect(screen.getByRole('heading', { name: 'Verification status out of date' })).toBeInTheDocument()
        expect(screen.getByText('Last confirmed status: Verification running')).toBeInTheDocument()
        expect(screen.getByText(/last confirmed.*out of date/i)).toBeInTheDocument()
        await tick(60_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
    })

    it('bounds automatic checks and permits an explicit status refresh afterwards', async () => {
        const { fetch } = await loadTimedJob()
        for (let check = 0; check < 60; check += 1) await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(61)
        expect(screen.getByText(/automatic status checks.*paused/i)).toBeInTheDocument()
        await tick(30_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(61)
        act(() => screen.getByRole('button', { name: 'Refresh status' }).click())
        await tick(5)
        expect(requestsFor(fetch, statusPath)).toHaveLength(62)
    })
})
