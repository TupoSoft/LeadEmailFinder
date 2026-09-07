import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication } from '../../app/AuthRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { TeamPage } from './TeamPage'
import { teamCopy } from './team-copy'
import { teamQueryKey, type TeamMember } from './team-api'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}

beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value: function (this: HTMLDialogElement) {
            this.open = true
        },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value: function (this: HTMLDialogElement) {
            this.open = false
        },
    })
})
afterEach(() => {
    cleanup()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const account: CurrentAccount = {
    email: 'owner@example.test',
    membership: { id: 'owner-a', role: 'owner' },
    organization: { id: 'organization-a', name: 'Example workspace' },
    capabilities: ['team.manage'],
    grantableServiceClientPermissions: [],
}
const activeMember: TeamMember = { id: 'member-a', email: 'member@example.test', role: 'member', status: 'active' }
const ownerMember: TeamMember = { id: 'owner-a', email: 'owner@example.test', role: 'owner', status: 'active' }
const disabledMember: TeamMember = { id: 'disabled-a', email: null, role: 'admin', status: 'disabled' }
const membersPath = '/v1/organizations/organization-a/members'
const invitationsPath = '/v1/organizations/organization-a/invitations'

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
            id: 'invitation-a',
            email: 'invited@example.test',
            role: 'member',
            expiresAt: '2026-10-01T12:00:00.000Z',
            token: crypto.randomUUID(),
        },
        { status: 201 },
    )
}

function renderTeam({
    role = 'owner',
    capabilities = account.capabilities,
    intercept,
}: {
    role?: CurrentAccount['membership']['role']
    capabilities?: CurrentAccount['capabilities']
    intercept?: (request: Request) => Response | Promise<Response> | undefined
} = {}) {
    const fetch = vi.fn((request: Request) => {
        const custom = intercept?.(request)
        if (custom !== undefined) return Promise.resolve(custom)
        const path = new URL(request.url).pathname
        if (path === '/v1/auth/session')
            return Promise.resolve(
                Response.json({ ...account, capabilities, membership: { ...account.membership, role } }),
            )
        if (path === membersPath) return Promise.resolve(Response.json([ownerMember, activeMember, disabledMember]))
        if (path === invitationsPath) return Promise.resolve(issuedResponse())
        if (request.method === 'PATCH') return Promise.resolve(Response.json({ ...activeMember, role: 'admin' }))
        if (request.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
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
                            { path: '/app/team', element: <TeamPage /> },
                            { path: '/app/forbidden', element: <ForbiddenPage /> },
                        ],
                    },
                    { path: '/outside', element: <p>Outside team</p> },
                ],
            },
        ],
        { initialEntries: ['/app/team'] },
    )
    const view = render(<RouterProvider router={router} />)
    return { fetch, session, router, ...view }
}

function requestsFor(fetch: ReturnType<typeof renderTeam>['fetch'], path: string, method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === path && request.method === method)
}

async function invite(user = userEvent.setup()) {
    await user.type(await screen.findByRole('textbox', { name: 'Email address' }), 'invited@example.test')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))
    return user
}

describe('team management', () => {
    it('lists active, disabled, and null-email memberships without offering reactivation', async () => {
        const { session } = renderTeam()
        expect(await screen.findByText('Members 1–3 of 3')).toBeInTheDocument()
        const disabled = screen.getByText('Email unavailable').closest('tr')!
        expect(within(disabled).getByText('Disabled')).toBeInTheDocument()
        expect(within(disabled).queryByRole('button')).not.toBeInTheDocument()
        expect(session.queryClient.getQueryData(teamQueryKey(account.organization.id))).toEqual([
            ownerMember,
            activeMember,
            disabledMember,
        ])
    })

    it('uses authoritative member-list authorization on direct navigation without a capability hint', async () => {
        const { fetch } = renderTeam({
            capabilities: [],
            intercept: request =>
                new URL(request.url).pathname === membersPath ? new Response(null, { status: 403 }) : undefined,
        })
        expect(await screen.findByRole('heading', { name: /access/i })).toBeInTheDocument()
        expect(requestsFor(fetch, membersPath)).toHaveLength(1)
    })

    it('guides administrators away from owner controls while retaining other role actions', async () => {
        renderTeam({ role: 'admin' })
        expect(await screen.findByText('Members 1–3 of 3')).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Role for owner@example.test' })).not.toBeInTheDocument()
        const role = screen.getByRole('combobox', { name: 'Role for member@example.test' })
        expect(within(role).queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument()
        expect(within(role).getByRole('option', { name: 'Administrator' })).toBeInTheDocument()
    })

    it('validates the email inline and focuses the field before issuing a request', async () => {
        const { fetch } = renderTeam()
        await userEvent.click(await screen.findByRole('button', { name: 'Create invitation' }))
        const email = screen.getByRole('textbox', { name: 'Email address' })
        expect(email).toHaveFocus()
        expect(email).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText(teamCopy.emailError)).toBeInTheDocument()
        expect(requestsFor(fetch, invitationsPath, 'POST')).toHaveLength(0)
    })

    it('confirms owner changes with safe initial focus and displays a final-owner conflict authoritatively', async () => {
        const { fetch } = renderTeam({
            intercept: request => (request.method === 'PATCH' ? new Response(null, { status: 409 }) : undefined),
        })
        const role = await screen.findByRole('combobox', { name: 'Role for owner@example.test' })
        await userEvent.selectOptions(role, 'admin')
        const save = screen.getByRole('button', { name: 'Save role for owner@example.test' })
        await userEvent.click(save)
        const dialog = screen.getByRole('dialog', { name: 'Confirm owner role change' })
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
        expect(requestsFor(fetch, `${membersPath}/owner-a`, 'PATCH')).toHaveLength(0)
        await userEvent.click(within(dialog).getByRole('button', { name: 'Save role' }))
        expect(await screen.findByText(teamCopy.conflict)).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, membersPath).length).toBeGreaterThan(1))
        expect(screen.queryByText(teamCopy.roleSaved)).not.toBeInTheDocument()
    })

    it('waits for the server before reporting a regular role change and prevents duplicate submissions', async () => {
        const delayed = deferred<Response>()
        let saved = false
        const { fetch, session } = renderTeam({
            intercept: request => {
                if (request.method === 'PATCH') return delayed.promise
                if (new URL(request.url).pathname === membersPath && saved)
                    return Response.json([{ ...activeMember, role: 'admin' }])
            },
        })
        const role = await screen.findByRole('combobox', { name: 'Role for member@example.test' })
        await userEvent.selectOptions(role, 'admin')
        const save = screen.getByRole('button', { name: 'Save role for member@example.test' })
        await userEvent.click(save)
        expect(save).toBeDisabled()
        expect(screen.queryByText(teamCopy.roleSaved)).not.toBeInTheDocument()
        expect(
            session.queryClient
                .getQueryData<TeamMember[]>(teamQueryKey(account.organization.id))
                ?.find(member => member.id === activeMember.id)?.role,
        ).toBe('member')
        saved = true
        await act(async () => {
            delayed.resolve(Response.json({ ...activeMember, role: 'admin' }))
            await delayed.promise
        })
        const notice = await screen.findByText(teamCopy.roleSaved)
        expect(notice).toHaveFocus()
        expect(notice.closest('[aria-live="polite"]')).not.toBeNull()
        await waitFor(() =>
            expect(
                session.queryClient.getQueryData<TeamMember[]>(teamQueryKey(account.organization.id))?.[0].role,
            ).toBe('admin'),
        )
        expect(requestsFor(fetch, `${membersPath}/member-a`, 'PATCH')).toHaveLength(1)
    })

    it('requires confirmation for removal, restores focus on cancel, and refreshes successful changes', async () => {
        let removed = false
        const { fetch } = renderTeam({
            intercept: request => {
                if (request.method === 'DELETE') {
                    removed = true
                    return new Response(null, { status: 204 })
                }
                if (new URL(request.url).pathname === membersPath && removed)
                    return Response.json([ownerMember, { ...activeMember, status: 'disabled' }])
            },
        })
        const remove = await screen.findByRole('button', { name: 'Disable access for member@example.test' })
        await userEvent.click(remove)
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
        expect(remove).toHaveFocus()
        expect(requestsFor(fetch, `${membersPath}/member-a`, 'DELETE')).toHaveLength(0)
        await userEvent.click(remove)
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable access' }))
        const notice = await screen.findByText(teamCopy.removed)
        expect(notice).toHaveFocus()
        expect(notice.closest('[aria-live="polite"]')).not.toBeNull()
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Disable access for member@example.test' }),
            ).not.toBeInTheDocument(),
        )
    })

    it.each([403, 404, 409])(
        'keeps safe invitation input and refreshes members after an HTTP %s rejection',
        async status => {
            const { fetch } = renderTeam({
                intercept: request => (request.method === 'POST' ? new Response(null, { status }) : undefined),
            })
            await invite()
            expect(
                await screen.findByText(
                    status === 403 ? teamCopy.rejected : status === 404 ? teamCopy.missing : teamCopy.conflict,
                ),
            ).toBeInTheDocument()
            expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('invited@example.test')
            await waitFor(() => expect(requestsFor(fetch, membersPath).length).toBeGreaterThan(1))
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        },
    )

    it('copies the one-time invitation and immediately clears the dialog without caching secrets', async () => {
        const user = userEvent.setup()
        const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
        const { fetch, session } = renderTeam()
        await invite(user)
        const dialog = await screen.findByRole('dialog', { name: 'Invitation created' })
        expect(within(dialog).getByRole('button', { name: 'Copy invitation link' })).toHaveFocus()
        const request = requestsFor(fetch, invitationsPath, 'POST')[0]
        expect(request.cache).toBe('no-store')
        expect(request.referrerPolicy).toBe('no-referrer')
        expect(request.headers.get('x-csrf-token')).toBe('csrf-fixture')
        await user.click(within(dialog).getByRole('button', { name: 'Copy invitation link' }))
        expect(await screen.findByText(teamCopy.copied)).toBeInTheDocument()
        expect(clipboard).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
        expect(
            JSON.stringify(
                session.queryClient
                    .getQueryCache()
                    .getAll()
                    .map(query => query.state.data),
            ).includes('/accept-invitation/'),
        ).toBe(false)
    })

    it('recovers from clipboard failure and permits dismissing the one-time link', async () => {
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard unavailable'))
        renderTeam()
        await invite(user)
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Copy invitation link' }))
        expect(await within(dialog).findByText(teamCopy.copyFailed)).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('textbox', { name: 'Invitation link' })).not.toBeInTheDocument()
    })

    it('requires explicit confirmation before creating an owner invitation', async () => {
        const { fetch } = renderTeam()
        const email = await screen.findByRole('textbox', { name: 'Email address' })
        await userEvent.type(email, 'invited.owner@example.test')
        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'owner')
        await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }))
        const dialog = screen.getByRole('dialog', { name: teamCopy.grantOwnerConfirmation })
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
        expect(requestsFor(fetch, invitationsPath, 'POST')).toHaveLength(0)
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        expect(email).toHaveValue('invited.owner@example.test')
    })

    it('clears an issued URL when history changes within the same team route', async () => {
        const { router } = renderTeam()
        await invite()
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        await act(() => router.navigate('/app/team?page=2'))
        expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await act(() => router.navigate(-1))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not restore the copied link or feedback after a delayed clipboard settlement crosses pagehide', async () => {
        const user = userEvent.setup()
        const delayed = deferred<void>()
        vi.spyOn(navigator.clipboard, 'writeText').mockReturnValue(delayed.promise)
        renderTeam()
        await invite(user)
        await user.click(
            within(await screen.findByRole('dialog')).getByRole('button', { name: 'Copy invitation link' }),
        )
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        await act(async () => {
            delayed.resolve()
            await delayed.promise
        })
        expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText(teamCopy.copied)).not.toBeInTheDocument()
    })

    it.each(['success', 'failure'])('ignores a late invitation %s after cancellation', async result => {
        const delayed = deferred<Response>()
        const { session } = renderTeam({
            intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
        })
        await invite()
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await act(async () => {
            delayed.resolve(result === 'success' ? issuedResponse() : new Response(null, { status: 409 }))
            await delayed.promise
        })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText(teamCopy.conflict)).not.toBeInTheDocument()
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
    })

    it.each(['before-restore', 'after-restore'])(
        'does not revive a delayed issued URL on pagehide/pageshow (%s)',
        async settlement => {
            const delayed = deferred<Response>()
            const { session } = renderTeam({
                intercept: request => (request.method === 'POST' ? delayed.promise : undefined),
            })
            await invite()
            await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
            if (settlement === 'before-restore')
                await act(async () => {
                    delayed.resolve(issuedResponse())
                    await delayed.promise
                })
            await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
            if (settlement === 'after-restore')
                await act(async () => {
                    delayed.resolve(issuedResponse())
                    await delayed.promise
                })
            expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument()
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
        },
    )

    it('clears a displayed secret before page restoration and ignores a delayed result after navigation', async () => {
        const first = renderTeam()
        await invite()
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        await act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        first.unmount()
        const delayed = deferred<Response>()
        const second = renderTeam({ intercept: request => (request.method === 'POST' ? delayed.promise : undefined) })
        await invite()
        await act(() => second.router.navigate('/outside'))
        await act(async () => {
            delayed.resolve(issuedResponse())
            await delayed.promise
        })
        expect(screen.getByText('Outside team')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(second.session.queryClient.getMutationCache().getAll()).toHaveLength(0)
    })

    it('shows empty and recoverable error states and disables changes offline', async () => {
        let fail = true
        renderTeam({
            intercept: request =>
                new URL(request.url).pathname === membersPath
                    ? fail
                        ? new Response(null, { status: 500 })
                        : Response.json([])
                    : undefined,
        })
        const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })
        fail = false
        await userEvent.click(retry)
        expect(await screen.findByText(teamCopy.empty)).toBeInTheDocument()
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        expect(screen.getByText(teamCopy.offline)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create invitation' })).toBeDisabled()
    })
})
