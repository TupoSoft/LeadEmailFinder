import { act, cleanup, configure, getConfig, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication } from '../../app/AuthRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { PlatformProxiesPage } from './PlatformProxiesPage'
import { type ProxyRecord } from './platform-proxies-api'
import { proxyCopy as copy } from './platform-proxies-copy'

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
    capabilities: ['platform.proxies.manage'],
    grantableServiceClientPermissions: [],
}
const proxy: ProxyRecord = {
    id: '00000000-0000-4000-8000-000000000001',
    host: 'proxy.example.test',
    port: 1080,
    protocol: 3,
    state: 'disabled',
    weight: 1,
    maxConcurrent: 1,
    requestsPerMinute: 10,
    description: 'Disposable fixture',
    blacklists: [],
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
}
const collection = '/v1/proxies'
const route = '/app/platform/proxies'
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}
function renderProxies({
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
            return Promise.resolve(Response.json({ proxies: [proxy], nextPageToken: '' }))
        if (path === collection && request.method === 'POST')
            return Promise.resolve(Response.json(proxy, { status: 201 }))
        if (path === `${collection}/${proxy.id}` && request.method === 'GET')
            return Promise.resolve(Response.json(proxy))
        if (path === `${collection}/${proxy.id}` && request.method === 'PATCH')
            return Promise.resolve(Response.json(proxy))
        if (request.method === 'DELETE' || request.method === 'POST')
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
                            { path: route, element: <PlatformProxiesPage /> },
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
function requests(fetch: ReturnType<typeof renderProxies>['fetch'], method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === collection && request.method === method)
}
async function openCreate(user = userEvent.setup()) {
    await user.click(await screen.findByRole('button', { name: copy.create }))
    const dialog = screen.getByRole('dialog', { name: copy.create })
    await user.type(within(dialog).getByLabelText('Host'), 'new.example.test')
    return { user, dialog }
}
function cacheIsSafe(session: AuthSession) {
    const data = JSON.stringify(
        session.queryClient
            .getQueryCache()
            .getAll()
            .map(query => query.state.data),
    )
    return (
        !data.includes('"auth"') &&
        !data.includes('"user"') &&
        !data.includes('"pass"') &&
        session.queryClient.getMutationCache().getAll().length === 0
    )
}

describe('platform-proxies', () => {
    it('rejects a customer route without reading registry data', async () => {
        const { fetch } = renderProxies({ capabilities: ['team.manage'] })
        expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
        expect(requests(fetch)).toHaveLength(0)
        expect(screen.queryByRole('link', { name: copy.title })).not.toBeInTheDocument()
    })

    it('uses exact cursors, appends unique records, strips unexpected auth and stops on empty cursor', async () => {
        const token = 'opaque-cursor-exact'
        const { fetch, session } = renderProxies({
            intercept: request => {
                if (new URL(request.url).pathname !== collection) return
                return Response.json(
                    new URL(request.url).searchParams.has('pageToken')
                        ? {
                              proxies: [proxy, { ...proxy, id: 'second', host: 'second.example.test' }],
                              nextPageToken: '',
                          }
                        : {
                              proxies: [{ ...proxy, auth: { user: crypto.randomUUID(), pass: crypto.randomUUID() } }],
                              nextPageToken: token,
                          },
                )
            },
        })
        await userEvent.click(await screen.findByRole('button', { name: copy.loadMore }))
        expect(await screen.findByText('second.example.test:1080')).toBeInTheDocument()
        expect(screen.getAllByText('proxy.example.test:1080')).toHaveLength(1)
        expect(screen.queryByRole('button', { name: copy.loadMore })).not.toBeInTheDocument()
        expect(new URL(requests(fetch)[1].url).searchParams.get('pageToken')).toBe(token)
        expect(cacheIsSafe(session)).toBe(true)
    })

    it('creates disabled with hidden auth, validates pair, and keeps pending and settled caches free of credentials', async () => {
        const settled = deferred<Response>()
        const { fetch, session } = renderProxies({
            intercept: request => (request.method === 'POST' ? settled.promise : undefined),
        })
        const { user, dialog } = await openCreate()
        expect(within(dialog).queryByLabelText(copy.username)).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('checkbox', { name: copy.useAuth }))
        await user.type(within(dialog).getByLabelText(copy.username), crypto.randomUUID())
        await user.click(within(dialog).getByRole('button', { name: copy.create }))
        expect(requests(fetch, 'POST')).toHaveLength(0)
        expect(within(dialog).getByLabelText(copy.password)).toHaveFocus()
        await user.type(within(dialog).getByLabelText(copy.password), crypto.randomUUID())
        await user.click(within(dialog).getByRole('button', { name: copy.create }))
        expect(requests(fetch, 'POST')).toHaveLength(1)
        const body = (await requests(fetch, 'POST')[0].clone().json()) as {
            state: string
            auth?: { user?: string; pass?: string }
        }
        expect(body.state).toBe('disabled')
        expect(Boolean(body.auth?.user && body.auth?.pass)).toBe(true)
        expect(cacheIsSafe(session)).toBe(true)
        expect(screen.queryByLabelText(copy.password)).not.toBeInTheDocument()
        expect(requests(fetch, 'POST')[0].cache).toBe('no-store')
        await act(async () => {
            settled.resolve(Response.json(proxy, { status: 201 }))
            await settled.promise
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(cacheIsSafe(session)).toBe(true)
        expect(screen.getByText(copy.success).parentElement).toHaveFocus()
    })

    it('reads fresh detail and omits auth and lifecycle for an ordinary edit', async () => {
        let patch: Request | undefined
        const { session } = renderProxies({
            intercept: request => {
                if (request.method === 'PATCH') patch = request
                return undefined
            },
        })
        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: copy.edit }))
        const description = await screen.findByLabelText('Description')
        expect(screen.queryByLabelText(copy.username)).not.toBeInTheDocument()
        await user.clear(description)
        await user.type(description, 'Updated visible fields')
        await user.click(screen.getByRole('button', { name: copy.save }))
        await waitFor(() => expect(Boolean(patch)).toBe(true))
        const body = (await patch!.clone().json()) as Record<string, unknown>
        expect('auth' in body).toBe(false)
        expect('state' in body).toBe(false)
        expect(body.description).toBe('Updated visible fields')
        expect(cacheIsSafe(session)).toBe(true)
    })

    it('confirms replacement and clears canceled credentials without a request', async () => {
        let writes = 0
        renderProxies({
            intercept: request => {
                if (request.method === 'PATCH') writes++
                return undefined
            },
        })
        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: copy.edit }))
        await user.click(await screen.findByRole('checkbox', { name: copy.replace }))
        await user.type(screen.getByLabelText(copy.username), crypto.randomUUID())
        await user.type(screen.getByLabelText(copy.password), crypto.randomUUID())
        await user.click(screen.getByRole('button', { name: copy.save }))
        expect(screen.getByRole('heading', { name: 'Replace authentication?' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel replacement' })).toHaveFocus()
        expect(writes).toBe(0)
        await user.click(screen.getByRole('button', { name: 'Cancel replacement' }))
        expect(screen.queryByLabelText(copy.username)).not.toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: copy.replace })).not.toBeChecked()
        expect(writes).toBe(0)
    })

    it('requires reconciliation after an unknown write, never replays it, and permits an explicit decision after refresh', async () => {
        const { fetch } = renderProxies({
            intercept: request =>
                request.method === 'POST' ? Promise.reject(new TypeError('Network failed')) : undefined,
        })
        const { user, dialog } = await openCreate()
        await user.click(within(dialog).getByRole('button', { name: copy.create }))
        expect(await screen.findByText(copy.unknown)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.reviewed })).toBeEnabled())
        expect(screen.getByRole('button', { name: copy.create })).toBeDisabled()
        await user.click(screen.getByRole('button', { name: copy.refresh }))
        expect(requests(fetch, 'POST')).toHaveLength(1)
        await user.click(screen.getByRole('button', { name: copy.reviewed }))
        await waitFor(() => expect(screen.getByRole('button', { name: copy.create })).toBeEnabled())
    })

    it.each(['pagehide', 'unmount', 'dismiss'] as const)(
        'ignores delayed settlement after %s and scrubs caches and native controls',
        async boundary => {
            const settled = deferred<Response>()
            const { fetch, session, unmount } = renderProxies({
                intercept: request => (request.method === 'POST' ? settled.promise : undefined),
            })
            const { user, dialog } = await openCreate()
            await user.click(within(dialog).getByRole('checkbox', { name: copy.useAuth }))
            const username = within(dialog).getByLabelText<HTMLInputElement>(copy.username)
            const password = within(dialog).getByLabelText<HTMLInputElement>(copy.password)
            await user.type(username, crypto.randomUUID())
            await user.type(password, crypto.randomUUID())
            await user.click(within(dialog).getByRole('button', { name: copy.create }))
            if (boundary === 'pagehide') {
                act(() => {
                    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
                })
                act(() => {
                    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
                })
            } else if (boundary === 'unmount') unmount()
            else await user.click(within(dialog).getByRole('button', { name: copy.cancelWaiting }))
            expect(username.value.length + password.value.length).toBe(0)
            await act(async () => {
                settled.resolve(Response.json(proxy, { status: 201 }))
                await settled.promise
            })
            expect(screen.queryByLabelText(copy.password)).not.toBeInTheDocument()
            expect(cacheIsSafe(session)).toBe(true)
            expect(requests(fetch, 'POST')).toHaveLength(1)
        },
    )

    it('renders missing detail without editable fields', async () => {
        renderProxies({
            intercept: request =>
                new URL(request.url).pathname === `${collection}/${proxy.id}`
                    ? new Response(null, { status: 404 })
                    : undefined,
        })
        await userEvent.click(await screen.findByRole('button', { name: copy.edit }))
        expect(await screen.findByText(copy.missing)).toBeInTheDocument()
        expect(screen.queryByLabelText('Host')).not.toBeInTheDocument()
    })

    it('renders validation rejection with no uncertainty marker and allows correction', async () => {
        renderProxies({
            intercept: request => (request.method === 'POST' ? new Response(null, { status: 400 }) : undefined),
        })
        const { user, dialog } = await openCreate()
        await user.click(within(dialog).getByRole('button', { name: copy.create }))
        expect(await screen.findByText(copy.invalid)).toBeInTheDocument()
        expect(screen.queryByText(copy.unknown)).not.toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: copy.create })).toBeEnabled())
    })
    it('keeps loaded later-page rows visible after a confirmed blacklist report', async () => {
        let blacklisted = false
        const later = { ...proxy, id: '00000000-0000-4000-8000-000000000002', host: 'later.example.test' }
        renderProxies({
            intercept: request => {
                const url = new URL(request.url)
                if (url.pathname === collection)
                    return Response.json(
                        url.searchParams.has('pageToken')
                            ? {
                                  proxies: [{ ...later, blacklists: blacklisted ? ['mx.example.test'] : [] }],
                                  nextPageToken: '',
                              }
                            : { proxies: [proxy], nextPageToken: proxy.id },
                    )
                if (url.pathname === `${collection}/${later.id}`) return Response.json(later)
                if (url.pathname.endsWith('/blacklists')) {
                    blacklisted = true
                    return new Response(null, { status: 204 })
                }
            },
        })
        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: copy.loadMore }))
        const row = (await screen.findByText('later.example.test:1080')).closest('tr')!
        await user.click(within(row).getByRole('button', { name: copy.blacklist }))
        await user.type(await screen.findByLabelText(copy.mxHost), 'mx.example.test')
        await user.click(screen.getByRole('button', { name: copy.report }))
        expect(await screen.findByText('mx.example.test')).toBeInTheDocument()
        expect(screen.getByText('later.example.test:1080')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('names the freshly read endpoint before a lifecycle confirmation', async () => {
        renderProxies({
            intercept: request =>
                new URL(request.url).pathname === `${collection}/${proxy.id}`
                    ? Response.json({ ...proxy, host: 'changed.example.test', port: 9000 })
                    : undefined,
        })
        await userEvent.click(await screen.findByRole('button', { name: 'Activate' }))
        const dialog = await screen.findByRole('dialog', { name: 'Activate proxy' })
        await waitFor(() =>
            expect(dialog).toHaveAccessibleDescription(expect.stringContaining('changed.example.test:9000')),
        )
        expect(within(dialog).getByRole('button', { name: copy.cancel })).toHaveFocus()
    })
})
