import { act, cleanup, configure, fireEvent, getConfig, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication } from '../../app/AuthRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { PlatformOrganizationsPage } from './PlatformOrganizationsPage'
import { organizationDirectoryQueryKey, type DirectoryOrganization } from './platform-organizations-api'
import { organizationsCopy as copy } from './platform-organizations-copy'
import { readOrganizationRecoveryHint } from './organization-recovery-hint'

const NativeRequest = globalThis.Request
const originalElementError = getConfig().getElementError
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
    configure({ getElementError: message => new Error(message ?? 'Element assertion failed') })
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
    sessionStorage.clear()
    configure({ getElementError: originalElementError })
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})
const account: CurrentAccount = {
    email: 'operator@example.test',
    membership: { id: 'operator', role: 'owner' },
    organization: { id: 'platform', name: 'Platform' },
    capabilities: ['platform.organizations.manage'],
    grantableServiceClientPermissions: [],
}
const organization: DirectoryOrganization = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Example customer',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
}
const collection = '/v1/organizations'
const route = '/app/platform/organizations'
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}
function issuedResponse() {
    return Response.json(
        {
            organizationId: organization.id,
            invitation: {
                id: 'invitation',
                email: 'first-owner@example.test',
                role: 'owner',
                expiresAt: '2026-10-01T12:00:00.000Z',
                token: crypto.randomUUID(),
            },
        },
        { status: 201 },
    )
}
function renderOrganizations({
    capabilities = account.capabilities,
    membershipId = account.membership.id,
    intercept,
}: {
    capabilities?: CurrentAccount['capabilities']
    membershipId?: string
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/auth/session')
            return Promise.resolve(
                Response.json({ ...account, capabilities, membership: { ...account.membership, id: membershipId } }),
            )
        if (path === collection && request.method === 'GET')
            return Promise.resolve(Response.json({ organizations: [organization] }))
        if (path === collection && request.method === 'POST') return Promise.resolve(issuedResponse())
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
                            { path: route, element: <PlatformOrganizationsPage /> },
                            { path: '/app/forbidden', element: <ForbiddenPage /> },
                        ],
                    },
                    { path: '/outside', element: <p>Outside organizations</p> },
                ],
            },
        ],
        { initialEntries: [route] },
    )
    return { fetch, session, router, ...render(<RouterProvider router={router} />) }
}
function requests(fetch: ReturnType<typeof renderOrganizations>['fetch'], method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === collection && request.method === method)
}
async function create(user = userEvent.setup()) {
    await user.type(await screen.findByLabelText(copy.name), 'New customer')
    await user.type(screen.getByLabelText(copy.ownerEmail), 'first-owner@example.test')
    await user.click(screen.getByRole('button', { name: copy.create }))
    return user
}
function cachesAreSecretFree(session: AuthSession) {
    return (
        !JSON.stringify(
            session.queryClient
                .getQueryCache()
                .getAll()
                .map(query => query.state.data),
        ).includes('invitation') && session.queryClient.getMutationCache().getAll().length === 0
    )
}

describe('platform organization console', () => {
    it('hides the directory and navigation from customer capabilities without dispatching a request', async () => {
        const { fetch } = renderOrganizations({ capabilities: ['team.manage'] })
        expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: copy.title })).not.toBeInTheDocument()
        expect(requests(fetch)).toHaveLength(0)
    })

    it('passes opaque cursors unchanged, deduplicates rows, and has no invented terminal count', async () => {
        const token = 'Opaque_Middle-Position'
        const second = { ...organization, id: '00000000-0000-4000-8000-000000000002', name: 'Older customer' }
        const { fetch } = renderOrganizations({
            intercept: request => {
                if (new URL(request.url).pathname !== collection) return
                return Response.json(
                    new URL(request.url).searchParams.has('pageToken')
                        ? { organizations: [organization, second] }
                        : { organizations: [organization], nextPageToken: token },
                )
            },
        })
        expect(await screen.findByRole('link', { name: copy.title })).toHaveAttribute('href', route)
        expect(await screen.findByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'ID' })).toBeInTheDocument()
        expect(screen.getByLabelText('Organization name')).toBeInTheDocument()
        await userEvent.click(await screen.findByRole('button', { name: copy.loadMore }))
        expect(await screen.findByText(second.name)).toBeInTheDocument()
        expect(screen.getAllByText(organization.name)).toHaveLength(1)
        expect(screen.queryByRole('button', { name: copy.loadMore })).not.toBeInTheDocument()
        expect(new URL(requests(fetch)[1].url).searchParams.get('pageToken')).toBe(token)
        expect(new URL(requests(fetch)[0].url).searchParams.get('pageSize')).toBe('50')
        expect(screen.queryByText(/last page|total organizations|\d+ of \d+/i)).not.toBeInTheDocument()
    })

    it('clears all loaded pages and reloads the first page after creation', async () => {
        const { fetch, session } = renderOrganizations({
            intercept: request => {
                if (new URL(request.url).pathname === collection && request.method === 'GET')
                    return Response.json(
                        new URL(request.url).searchParams.has('pageToken')
                            ? { organizations: [{ ...organization, id: 'older', name: 'Older customer' }] }
                            : { organizations: [organization], nextPageToken: 'continue' },
                    )
            },
        })
        await userEvent.click(await screen.findByRole('button', { name: copy.loadMore }))
        expect(await screen.findByText('Older customer')).toBeInTheDocument()
        await create()
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByRole('button', { name: copy.copy })).toHaveFocus()
        await waitFor(() => expect(requests(fetch)).toHaveLength(3))
        expect(new URL(requests(fetch)[2].url).searchParams.has('pageToken')).toBe(false)
        expect(screen.queryByText('Older customer')).not.toBeInTheDocument()
        expect(cachesAreSecretFree(session)).toBe(true)
        const request = requests(fetch, 'POST')[0]
        expect(request.cache).toBe('no-store')
        expect(request.referrerPolicy).toBe('no-referrer')
        expect(request.headers.get('x-csrf-token')).toBe('csrf-fixture')
    })

    it('allow-lists directory metadata before caching', async () => {
        const { session } = renderOrganizations({
            intercept: request =>
                new URL(request.url).pathname === collection
                    ? Response.json({
                          organizations: [{ ...organization, invitation: { token: crypto.randomUUID() } }],
                          token: crypto.randomUUID(),
                      })
                    : undefined,
        })
        await screen.findByText(organization.name)
        expect(cachesAreSecretFree(session)).toBe(true)
        expect(JSON.stringify(session.queryClient.getQueryData(organizationDirectoryQueryKey)).includes('token')).toBe(
            false,
        )
    })

    it('associates validation messages with fields and focuses the first invalid field', async () => {
        const { fetch } = renderOrganizations()
        await userEvent.click(await screen.findByRole('button', { name: copy.create }))
        const name = screen.getByLabelText(copy.name)
        expect(name).toHaveFocus()
        expect(name).toHaveAttribute('aria-invalid', 'true')
        expect(name).toHaveAccessibleDescription(copy.nameError)
        await userEvent.type(name, 'Customer')
        await userEvent.click(screen.getByRole('button', { name: copy.create }))
        const email = screen.getByLabelText(copy.ownerEmail)
        expect(email).toHaveFocus()
        expect(email).toHaveAccessibleDescription(copy.emailError)
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })

    it.each(['button', 'native'] as const)('clears one-time local and DOM references after %s copy', async mode => {
        const user = userEvent.setup()
        const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
        const { session } = renderOrganizations()
        await create(user)
        const dialog = await screen.findByRole('dialog')
        const input = within(dialog).getByLabelText<HTMLInputElement>(copy.secretLabel)
        expect(input.value.startsWith(`${window.location.origin}/accept-invitation/`)).toBe(true)
        expect(cachesAreSecretFree(session)).toBe(true)
        if (mode === 'button') await user.click(within(dialog).getByRole('button', { name: copy.copy }))
        else fireEvent.copy(input, { clipboardData: { setData: vi.fn() } })
        await screen.findByText(copy.copied)
        expect(input.value.length === 0).toBe(true)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toHaveFocus()
        if (mode === 'button') expect(clipboard.mock.calls.length).toBe(1)
        clipboard.mockClear()
    })

    it('keeps the visible link after clipboard failure and dismisses with Escape', async () => {
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Unavailable'))
        renderOrganizations()
        await create(user)
        const dialog = await screen.findByRole('dialog')
        const input = within(dialog).getByLabelText<HTMLInputElement>(copy.secretLabel)
        await user.click(within(dialog).getByRole('button', { name: copy.copy }))
        await screen.findByText(copy.copyFailed)
        expect(input.value.length > 0).toBe(true)
        fireEvent(dialog, new Event('cancel', { cancelable: true }))
        expect(input.value.length === 0).toBe(true)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('requires explicit reconciliation after a lost creation response and never retries', async () => {
        const { fetch, router } = renderOrganizations({
            intercept: request =>
                request.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await create()
        await screen.findByText(copy.unknown)
        expect(requests(fetch, 'POST')).toHaveLength(1)
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        await act(() => router.navigate('/outside'))
        await act(() => router.navigate(route))
        await screen.findByText(copy.unknown)
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewed })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: copy.reviewed }))
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
        expect(requests(fetch, 'POST')).toHaveLength(1)
    })

    it.each([400, 403, 409])('shows safe correction guidance after a confirmed %s rejection', async status => {
        const { fetch, session } = renderOrganizations({
            intercept: request => (request.method === 'POST' ? new Response(null, { status }) : undefined),
        })
        await create()
        await screen.findByText(status === 400 ? copy.invalid : status === 403 ? copy.rejected : copy.conflict)
        expect(screen.queryByText(copy.unknown)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(requests(fetch, 'POST')).toHaveLength(1)
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('treats a malformed successful creation response as unconfirmed', async () => {
        renderOrganizations({
            intercept: request =>
                request.method === 'POST'
                    ? Response.json({ organizationId: organization.id, invitation: {} }, { status: 201 })
                    : undefined,
        })
        await create()
        await screen.findByText(copy.unknown)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
    })

    it('blocks duplicate creation during the pending request', async () => {
        const delayed = deferred<Response>()
        const { fetch } = renderOrganizations({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await create()
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        expect(screen.getByLabelText(copy.name)).toBeDisabled()
        await userEvent.click(screen.getByRole('button', { name: copy.create }))
        expect(requests(fetch, 'POST')).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: copy.cancel }))
        await act(async () => {
            delayed.resolve(issuedResponse())
            await delayed.promise
        })
    })

    it('disables actions offline and never retries creation on reconnect', async () => {
        const { fetch } = renderOrganizations()
        await screen.findByText(organization.name)
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        expect(screen.getByText(copy.offline)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        expect(screen.getByRole('button', { name: copy.refresh })).toBeDisabled()
        online.mockReturnValue(true)
        await act(() => window.dispatchEvent(new Event('online')))
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
        expect(requests(fetch, 'POST')).toHaveLength(0)
    })

    it('ignores an old in-flight directory page after creation resets the query', async () => {
        const delayed = deferred<Response>()
        const { fetch } = renderOrganizations({
            intercept: request => {
                if (new URL(request.url).pathname === collection && request.method === 'GET')
                    return new URL(request.url).searchParams.has('pageToken')
                        ? delayed.promise
                        : Response.json({ organizations: [organization], nextPageToken: 'older' })
            },
        })
        await userEvent.click(await screen.findByRole('button', { name: copy.loadMore }))
        await create()
        await screen.findByRole('dialog')
        await waitFor(() => expect(requests(fetch)).toHaveLength(3))
        expect(requests(fetch)[1].signal.aborted).toBe(true)
        await act(async () => {
            delayed.resolve(
                Response.json({ organizations: [{ ...organization, id: 'stale', name: 'Stale organization' }] }),
            )
            await delayed.promise
        })
        expect(screen.queryByText('Stale organization')).not.toBeInTheDocument()
    })

    it.each(['cancel', 'pagehide', 'pageshow', 'navigation', 'unmount'] as const)(
        'ignores delayed success after %s invalidates the operation',
        async boundary => {
            const delayed = deferred<Response>()
            const { fetch, session, router, unmount } = renderOrganizations({
                intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
            })
            await create()
            if (boundary === 'cancel') await userEvent.click(screen.getByRole('button', { name: copy.cancel }))
            else if (boundary === 'navigation') await act(() => router.navigate('/outside'))
            else if (boundary === 'unmount') unmount()
            else await act(() => window.dispatchEvent(new PageTransitionEvent(boundary, { persisted: true })))
            expect(requests(fetch, 'POST')[0].signal.aborted).toBe(true)
            await act(async () => {
                delayed.resolve(issuedResponse())
                await delayed.promise
            })
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(cachesAreSecretFree(session)).toBe(true)
            expect(requests(fetch, 'POST')).toHaveLength(1)
        },
    )

    it('ignores a delayed failure from a dismissed generation', async () => {
        const delayed = deferred<Response>()
        renderOrganizations({ intercept: request => (request.method === 'POST' ? delayed.promise : undefined) })
        await create()
        await userEvent.click(screen.getByRole('button', { name: copy.cancel }))
        await act(async () => {
            delayed.resolve(new Response(null, { status: 409 }))
            await delayed.promise
        })
        expect(screen.queryByText(copy.conflict)).not.toBeInTheDocument()
        expect(screen.getByText(copy.unknown)).toBeInTheDocument()
    })

    it('synchronously clears secret and form fields on pagehide and cannot restore them', async () => {
        const { session } = renderOrganizations()
        await create()
        const input = within(await screen.findByRole('dialog')).getByLabelText<HTMLInputElement>(copy.secretLabel)
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        expect(input.value.length === 0).toBe(true)
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        await screen.findByRole('heading', { name: copy.title })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByLabelText(copy.name)).toHaveValue('')
        expect(screen.getByLabelText(copy.ownerEmail)).toHaveValue('')
        expect(screen.getByText(copy.dismissed)).toBeInTheDocument()
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('preserves unconfirmed-creation reconciliation through BFCache authentication refresh', async () => {
        const delayed = deferred<Response>()
        const { fetch } = renderOrganizations({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await create()
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        await screen.findByText(copy.unknown)
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        await act(async () => {
            delayed.resolve(issuedResponse())
            await delayed.promise
        })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(requests(fetch, 'POST')).toHaveLength(1)
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewed })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: copy.reviewed }))
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
    })

    it('requires reconciliation after reload creates a new API session and clears the hint only after acknowledgment', async () => {
        const first = renderOrganizations({
            intercept: request =>
                request.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await create()
        await screen.findByText(copy.unknown)
        expect(readOrganizationRecoveryHint(account.membership.id)).toBe(true)
        expect(Object.values(sessionStorage)).toEqual(['1'])
        first.unmount()
        const restored = renderOrganizations()
        expect(restored.session.api === first.session.api).toBe(false)
        await screen.findByText(copy.unknown)
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewed })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: copy.reviewed }))
        expect(readOrganizationRecoveryHint(account.membership.id)).toBe(false)
        expect(requests(restored.fetch, 'POST')).toHaveLength(0)
    })

    it('sets the reload hint before dispatch and removes it after confirmed creation', async () => {
        const delayed = deferred<Response>()
        renderOrganizations({ intercept: request => (request.method === 'POST' ? delayed.promise : undefined) })
        await create()
        expect(readOrganizationRecoveryHint(account.membership.id)).toBe(true)
        expect(Object.values(sessionStorage)).toEqual(['1'])
        await act(async () => {
            delayed.resolve(issuedResponse())
            await delayed.promise
        })
        await screen.findByRole('dialog')
        expect(readOrganizationRecoveryHint(account.membership.id)).toBe(false)
        expect(sessionStorage.length).toBe(0)
    })

    it('isolates the reload reconciliation hint from a different membership', async () => {
        const first = renderOrganizations({
            intercept: request =>
                request.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await create()
        await screen.findByText(copy.unknown)
        first.unmount()
        renderOrganizations({ membershipId: 'different-operator' })
        await screen.findByText(organization.name)
        expect(screen.queryByText(copy.unknown)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
        expect(readOrganizationRecoveryHint('different-operator')).toBe(false)
        expect(readOrganizationRecoveryHint(account.membership.id)).toBe(true)
    })

    it('keeps same-document reconciliation when the browser blocks storage', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('Blocked')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Blocked')
        })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('Blocked')
        })
        const { router } = renderOrganizations({
            intercept: request =>
                request.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : undefined,
        })
        await create()
        await screen.findByText(copy.unknown)
        await act(() => router.navigate('/outside'))
        await act(() => router.navigate(route))
        await screen.findByText(copy.unknown)
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
    })

    it('clears a filled form on pagehide before the document is restored', async () => {
        renderOrganizations()
        const name = await screen.findByLabelText<HTMLInputElement>(copy.name)
        const email = screen.getByLabelText<HTMLInputElement>(copy.ownerEmail)
        await userEvent.type(name, 'Unsubmitted organization')
        await userEvent.type(email, 'unsubmitted@example.test')
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        expect(name.value.length === 0 && email.value.length === 0).toBe(true)
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        expect(screen.getByLabelText(copy.name)).toHaveValue('')
        expect(screen.getByLabelText(copy.ownerEmail)).toHaveValue('')
    })

    it('clears the dialog DOM on navigation and does not revive it after Back', async () => {
        const { router } = renderOrganizations()
        await create()
        const input = within(await screen.findByRole('dialog')).getByLabelText<HTMLInputElement>(copy.secretLabel)
        await act(() => router.navigate('/outside'))
        expect(input.value.length === 0).toBe(true)
        await act(() => router.navigate(-1))
        await screen.findByRole('heading', { name: copy.title })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not revive a delayed clipboard result after dismissal', async () => {
        const user = userEvent.setup()
        const delayed = deferred<void>()
        vi.spyOn(navigator.clipboard, 'writeText').mockReturnValue(delayed.promise)
        renderOrganizations()
        await create(user)
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: copy.copy }))
        await user.click(within(dialog).getByRole('button', { name: copy.close }))
        await act(async () => {
            delayed.resolve()
            await delayed.promise
        })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText(copy.copied)).not.toBeInTheDocument()
    })

    it('shows stable loading, empty and recoverable read failure states', async () => {
        const delayed = deferred<Response>()
        let fail = false
        renderOrganizations({
            intercept: request =>
                new URL(request.url).pathname === collection
                    ? fail
                        ? new Response(null, { status: 500 })
                        : delayed.promise
                    : undefined,
        })
        await screen.findByText('Loading…')
        await act(async () => {
            delayed.resolve(Response.json({ organizations: [] }))
            await delayed.promise
        })
        await screen.findByText(copy.empty)
        fail = true
        await userEvent.click(screen.getByRole('button', { name: copy.refresh }))
        await screen.findByRole('button', { name: 'Try again' })
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('offers first-page recovery for an invalid cursor and preserves loaded metadata', async () => {
        const { fetch } = renderOrganizations({
            intercept: request =>
                new URL(request.url).pathname === collection
                    ? new URL(request.url).searchParams.has('pageToken')
                        ? new Response(null, { status: 400 })
                        : Response.json({ organizations: [organization], nextPageToken: 'invalid-after-first-page' })
                    : undefined,
        })
        await userEvent.click(await screen.findByRole('button', { name: copy.loadMore }))
        await screen.findByText(copy.invalidCursor)
        expect(screen.getByText(organization.name)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: copy.refresh }))
        await waitFor(() => expect(requests(fetch)).toHaveLength(3))
        expect(new URL(requests(fetch)[2].url).searchParams.has('pageToken')).toBe(false)
    })
})
