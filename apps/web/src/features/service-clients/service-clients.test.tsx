import { act, cleanup, configure, getConfig, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication } from '../../app/AuthRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { ServiceClientsPage } from './ServiceClientsPage'
import { serviceClientsQueryKey, type ServiceClient } from './service-clients-api'
import { serviceClientsCopy as copy } from './service-clients-copy'

const NativeRequest = globalThis.Request
const originalElementError = getConfig().getElementError
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
    // A failing query must never dump a secret-bearing dialog into CLI output.
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
    configure({ getElementError: originalElementError })
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const account: CurrentAccount = {
    email: 'owner@example.test',
    membership: { id: 'owner-a', role: 'owner' },
    organization: { id: 'organization-a', name: 'Example workspace' },
    capabilities: ['service_clients.manage'],
    grantableServiceClientPermissions: ['verification:run', 'verification:read'],
}
const activeClient: ServiceClient = {
    id: 'client-a',
    clientId: 'application-a',
    description: 'Production integration',
    permissions: ['verification:run'],
    status: 'active',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
}
const disabledClient: ServiceClient = {
    ...activeClient,
    id: 'client-b',
    clientId: 'application-b',
    description: null,
    status: 'disabled',
}
const collection = '/v1/organizations/organization-a/service-clients'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}
function issuedResponse(status = 201) {
    return Response.json({ ...activeClient, clientSecret: crypto.randomUUID() }, { status })
}
function renderClients({
    capabilities = account.capabilities,
    grants = account.grantableServiceClientPermissions,
    intercept,
}: {
    capabilities?: CurrentAccount['capabilities']
    grants?: CurrentAccount['grantableServiceClientPermissions']
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/auth/session')
            return Promise.resolve(
                Response.json({ ...account, capabilities, grantableServiceClientPermissions: grants }),
            )
        if (path === collection && request.method === 'GET')
            return Promise.resolve(Response.json([activeClient, disabledClient]))
        if (path === collection && request.method === 'POST') return Promise.resolve(issuedResponse())
        if (path.endsWith('/rotate')) return Promise.resolve(issuedResponse(200))
        if (path.endsWith('/disable') || request.method === 'DELETE')
            return Promise.resolve(new Response(null, { status: 204 }))
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
                            { path: '/app/service-clients', element: <ServiceClientsPage /> },
                            { path: '/app/forbidden', element: <ForbiddenPage /> },
                        ],
                    },
                    { path: '/outside', element: <p>Outside clients</p> },
                ],
            },
        ],
        { initialEntries: ['/app/service-clients'] },
    )
    return { fetch, session, router, ...render(<RouterProvider router={router} />) }
}
function requests(fetch: ReturnType<typeof renderClients>['fetch'], path: string, method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === path && request.method === method)
}
async function create(user = userEvent.setup()) {
    await user.click(await screen.findByRole('checkbox', { name: 'verification:run' }))
    await user.click(screen.getByRole('button', { name: copy.create }))
    return user
}
async function confirmRotate() {
    await userEvent.click(await screen.findByRole('button', { name: `Rotate secret for ${activeClient.clientId}` }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: copy.rotate }))
}
function cachesAreSecretFree(session: AuthSession) {
    return (
        !JSON.stringify(
            session.queryClient
                .getQueryCache()
                .getAll()
                .map(query => query.state.data),
        ).includes('clientSecret') && session.queryClient.getMutationCache().getAll().length === 0
    )
}

describe('service-clients', () => {
    it('preserves server order, includes disabled clients and only displays server grant choices', async () => {
        const { session } = renderClients()
        expect(await screen.findByText('Service clients 1–2 of 2')).toBeInTheDocument()
        expect(screen.getAllByRole('checkbox').map(input => input.parentElement?.textContent)).toEqual(
            account.grantableServiceClientPermissions,
        )
        const disabled = screen.getByText(disabledClient.clientId).closest('tr')!
        expect(within(disabled).getByText('Disabled')).toBeInTheDocument()
        expect(within(disabled).getAllByRole('button')).toHaveLength(1)
        expect(session.queryClient.getQueryData(serviceClientsQueryKey(account.organization.id))).toEqual([
            activeClient,
            disabledClient,
        ])
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('denies direct navigation without the browser capability and never requests clients', async () => {
        const { fetch } = renderClients({ capabilities: [] })
        expect(await screen.findByRole('heading', { name: /access/i })).toBeInTheDocument()
        expect(requests(fetch, collection)).toHaveLength(0)
        expect(screen.queryByRole('link', { name: copy.title })).not.toBeInTheDocument()
    })

    it('handles authoritative list denial through shared recovery', async () => {
        renderClients({
            intercept: request =>
                new URL(request.url).pathname === collection ? new Response(null, { status: 403 }) : undefined,
        })
        expect(await screen.findByRole('heading', { name: /access/i })).toBeInTheDocument()
    })

    it('requires a permission and focuses its checkbox before issuing a create', async () => {
        const { fetch } = renderClients()
        await userEvent.click(await screen.findByRole('button', { name: copy.create }))
        expect(screen.getByRole('checkbox', { name: 'verification:run' })).toHaveFocus()
        expect(screen.getByText(copy.permissionsError)).toBeInTheDocument()
        expect(requests(fetch, collection, 'POST')).toHaveLength(0)
    })

    it('disables create when the server supplies no grant choices', async () => {
        renderClients({ grants: [] })
        expect(await screen.findByText(copy.unavailableGrants)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
    })

    it.each([400, 403, 404, 409])('keeps correctable create input on HTTP %s and does not retry', async status => {
        const { fetch } = renderClients({
            intercept: request => (request.method === 'POST' ? new Response(null, { status }) : undefined),
        })
        const user = userEvent.setup()
        await user.type(await screen.findByRole('textbox', { name: copy.descriptionLabel }), 'My integration')
        await create(user)
        expect(
            await screen.findByText(
                status === 400
                    ? copy.invalid
                    : status === 403
                      ? copy.rejected
                      : status === 404
                        ? copy.missing
                        : copy.conflict,
            ),
        ).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: copy.descriptionLabel })).toHaveValue('My integration')
        expect(screen.getByRole('checkbox', { name: 'verification:run' })).toBeChecked()
        expect(requests(fetch, collection, 'POST')).toHaveLength(1)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('keeps secrets outside caches, masks them initially, copies only on action and scrubs the detached input on close', async () => {
        const user = userEvent.setup()
        const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
        const { fetch, session } = renderClients()
        await create(user)
        const dialog = await screen.findByRole('dialog', { name: copy.secretTitle })
        const input = within(dialog).getByLabelText<HTMLInputElement>(copy.secretLabel)
        expect(input.type === 'password' && input.value.length > 0).toBe(true)
        expect(clipboard).not.toHaveBeenCalled()
        expect(cachesAreSecretFree(session)).toBe(true)
        await user.click(within(dialog).getByRole('button', { name: copy.show }))
        expect(input.type === 'text').toBe(true)
        await user.click(within(dialog).getByRole('button', { name: copy.copy }))
        expect(await within(dialog).findByText(copy.copied)).toBeInTheDocument()
        expect(clipboard).toHaveBeenCalledTimes(1)
        const request = requests(fetch, collection, 'POST')[0]
        expect(request.cache).toBe('no-store')
        expect(request.referrerPolicy).toBe('no-referrer')
        expect(request.headers.get('x-csrf-token')).toBe('csrf-fixture')
        await user.click(within(dialog).getByRole('button', { name: copy.close }))
        expect(input.value.length === 0).toBe(true)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.create })).toHaveFocus())
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('exports credentials only on explicit download and immediately revokes a secret-free object URL', async () => {
        const createObjectURL = vi.fn(() => 'blob:download')
        const revokeObjectURL = vi.fn()
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
        let filename = ''
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            filename = this.download
        })
        renderClients()
        await create()
        const dialog = await screen.findByRole('dialog')
        expect(createObjectURL).not.toHaveBeenCalled()
        await userEvent.click(within(dialog).getByRole('button', { name: copy.download }))
        expect(await within(dialog).findByText(copy.downloaded)).toBeInTheDocument()
        expect(filename).toBe('service-client-credentials.json')
        expect(createObjectURL).toHaveBeenCalledTimes(1)
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
        expect(document.querySelector('a[download]')).toBeNull()
    })

    it('keeps copy failure recoverable without exposing the value in feedback', async () => {
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Unavailable'))
        renderClients()
        await create(user)
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: copy.copy }))
        expect(await within(dialog).findByText(copy.copyFailed)).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: copy.download })).toBeEnabled()
    })

    it.each(['rotate', 'disable', 'delete'] as const)(
        'requires a consequence-specific %s confirmation with safe focus',
        async kind => {
            const { fetch } = renderClients()
            const accessibleName =
                kind === 'rotate'
                    ? `Rotate secret for ${activeClient.clientId}`
                    : `${kind === 'disable' ? 'Disable' : 'Delete'} client ${activeClient.clientId}`
            const button = await screen.findByRole('button', { name: accessibleName })
            await userEvent.click(button)
            const dialog = screen.getByRole('dialog')
            expect(within(dialog).getByRole('button', { name: copy.cancel })).toHaveFocus()
            expect(dialog.textContent?.includes(activeClient.clientId)).toBe(true)
            expect(
                requests(
                    fetch,
                    `${collection}/${activeClient.id}${kind === 'delete' ? '' : `/${kind}`}`,
                    kind === 'delete' ? 'DELETE' : 'POST',
                ),
            ).toHaveLength(0)
            await userEvent.click(within(dialog).getByRole('button', { name: copy.cancel }))
            expect(button).toHaveFocus()
        },
    )

    it('leaves rows unchanged until disable succeeds and prevents duplicate requests', async () => {
        const delayed = deferred<Response>()
        let disabled = false
        const { fetch } = renderClients({
            intercept: request => {
                if (new URL(request.url).pathname.endsWith('/disable')) return delayed.promise
                if (new URL(request.url).pathname === collection && disabled)
                    return Response.json([{ ...activeClient, status: 'disabled' }])
            },
        })
        await userEvent.click(await screen.findByRole('button', { name: `Disable client ${activeClient.clientId}` }))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: copy.disable }))
        expect(screen.getByText('Active')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: `Disable client ${activeClient.clientId}` })).toBeDisabled()
        disabled = true
        await act(async () => {
            delayed.resolve(new Response(null, { status: 204 }))
            await delayed.promise
        })
        expect(await screen.findByText(copy.disabled)).toBeInTheDocument()
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: `Rotate secret for ${activeClient.clientId}` }),
            ).not.toBeInTheDocument(),
        )
        expect(requests(fetch, `${collection}/${activeClient.id}/disable`, 'POST')).toHaveLength(1)
    })

    it.each(['create', 'rotate'] as const)(
        'requires explicit reconciliation after an uncertain %s and never retries',
        async kind => {
            const { fetch, session } = renderClients({
                intercept: request =>
                    request.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : undefined,
            })
            session.queryClient.setDefaultOptions({ mutations: { retry: 3 } })
            if (kind === 'create') await create()
            else await confirmRotate()
            expect(await screen.findByText(copy.unknown)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
            await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewed })).toBeEnabled())
            await userEvent.click(screen.getByRole('button', { name: copy.reviewed }))
            expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
            expect(
                requests(fetch, kind === 'create' ? collection : `${collection}/${activeClient.id}/rotate`, 'POST'),
            ).toHaveLength(1)
            expect(cachesAreSecretFree(session)).toBe(true)
        },
    )

    it.each(['create', 'rotate'] as const)('discards delayed %s settlement after Cancel waiting', async kind => {
        const delayed = deferred<Response>()
        const { session } = renderClients({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        if (kind === 'create') await create()
        else await confirmRotate()
        await userEvent.click(screen.getByRole('button', { name: copy.cancelWaiting }))
        await act(async () => {
            delayed.resolve(issuedResponse(kind === 'create' ? 201 : 200))
            await delayed.promise
        })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByText(copy.unknown)).toBeInTheDocument()
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it.each([
        ['create', 'success'],
        ['rotate', 'success'],
        ['create', 'failure'],
        ['rotate', 'failure'],
    ] as const)('discards delayed %s %s across pagehide and persisted pageshow', async (kind, outcome) => {
        const delayed = deferred<Response>()
        const { session } = renderClients({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        if (kind === 'create') await create()
        else await confirmRotate()
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        await act(async () => {
            delayed.resolve(
                outcome === 'success'
                    ? issuedResponse(kind === 'create' ? 201 : 200)
                    : new Response(null, { status: 409 }),
            )
            await delayed.promise
        })
        expect(await screen.findByRole('heading', { name: copy.title })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText(copy.conflict)).not.toBeInTheDocument()
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('does not revive a delayed clipboard result after closing the secret', async () => {
        const user = userEvent.setup()
        const delayed = deferred<void>()
        vi.spyOn(navigator.clipboard, 'writeText').mockReturnValue(delayed.promise)
        renderClients()
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
        expect(screen.getByText(copy.closed)).toBeInTheDocument()
    })

    it('synchronously scrubs an open secret on pagehide and never restores it on persisted pageshow', async () => {
        const { session } = renderClients()
        await create()
        const dialog = await screen.findByRole('dialog')
        const input = within(dialog).getByLabelText<HTMLInputElement>(copy.secretLabel)
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        expect(input.value.length === 0).toBe(true)
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        expect(await screen.findByRole('heading', { name: copy.title })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(cachesAreSecretFree(session)).toBe(true)
    })

    it('scrubs the input on route departure and does not restore it after Back', async () => {
        const { router } = renderClients()
        await create()
        const input = within(await screen.findByRole('dialog')).getByLabelText<HTMLInputElement>(copy.secretLabel)
        await act(() => router.navigate('/outside'))
        expect(input.value.length === 0).toBe(true)
        await act(() => router.navigate(-1))
        expect(await screen.findByRole('heading', { name: copy.title })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('preserves outcome-unknown reconciliation when navigating to another client page', async () => {
        const { fetch } = renderClients({
            intercept: request => {
                if (request.method === 'POST') return Promise.reject(new TypeError('Lost response'))
                if (new URL(request.url).pathname === collection)
                    return Response.json(
                        Array.from({ length: 11 }, (_, index) => ({
                            ...activeClient,
                            id: `client-${index}`,
                            clientId: `application-${index}`,
                        })),
                    )
            },
        })
        await create()
        expect(await screen.findByText(copy.unknown)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.next })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: copy.next }))
        expect(await screen.findByText('Service clients 11–11 of 11')).toBeInTheDocument()
        expect(screen.getByText(copy.unknown)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Rotate secret for application-10' })).toBeDisabled()
        expect(requests(fetch, collection, 'POST')).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: copy.reviewed }))
        expect(screen.getByRole('button', { name: copy.create })).toBeEnabled()
    })

    it('shows loading, empty and recoverable read errors without inventing rows', async () => {
        const delayed = deferred<Response>()
        let fail = false
        const { fetch } = renderClients({
            intercept: request =>
                new URL(request.url).pathname === collection
                    ? fail
                        ? new Response(null, { status: 500 })
                        : delayed.promise
                    : undefined,
        })
        expect(await screen.findByText('Loading…')).toBeInTheDocument()
        await act(async () => {
            delayed.resolve(Response.json([]))
            await delayed.promise
        })
        expect(await screen.findByText(copy.empty)).toBeInTheDocument()
        fail = true
        await userEvent.click(screen.getByRole('button', { name: copy.refresh }))
        expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(requests(fetch, collection)).toHaveLength(2)
    })
})
