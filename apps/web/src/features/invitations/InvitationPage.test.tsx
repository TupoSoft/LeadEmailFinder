import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession, type BoundaryChannel } from '../auth/auth-session'
import { InvitationPage } from './InvitationPage'
import { captureInvitationLocation, takeInvitationToken } from './invitation-bootstrap'
import { InvitationRequestError, type InvitationApi, type InvitationPreview } from './invitation-api'

const preview: InvitationPreview = {
    organizationName: 'Northstar research',
    email: 'invited@example.test',
    role: 'member',
    expiresAt: '2026-09-09T12:00:00.000Z',
    status: 'pending',
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
function mount(api: InvitationApi, withToken = true, session?: AuthSession) {
    const token = crypto.randomUUID()
    window.history.replaceState(
        null,
        '',
        withToken ? `/accept-invitation/${token}?unused=1#fragment` : '/accept-invitation',
    )
    captureInvitationLocation(window.location, window.history)
    return {
        ...render(
            <MemoryRouter>
                {session ? (
                    <AuthProvider session={session}>
                        <InvitationPage api={api} />
                    </AuthProvider>
                ) : (
                    <InvitationPage api={api} />
                )}
            </MemoryRouter>,
        ),
        token,
    }
}
function apiStub(): InvitationApi {
    return { preview: vi.fn().mockResolvedValue(preview), accept: vi.fn().mockResolvedValue(undefined) }
}
afterEach(() => {
    window.history.replaceState(null, '', '/')
    takeInvitationToken()
})

describe('invitation authority and acceptance', () => {
    it('sanitizes an encoded invitation route prefix before granting browser authority', () => {
        const token = crypto.randomUUID()
        window.history.replaceState(null, '', `/%61ccept-invitation/${token}`)
        expect(captureInvitationLocation(window.location, window.history)).toBe(true)
        expect(window.location.pathname).toBe('/accept-invitation')
        expect(takeInvitationToken() === token).toBe(true)
        expect(takeInvitationToken()).toBeUndefined()
    })

    it('discards a pending public preview at a shared session boundary without retaining mutation data', async () => {
        const channel: BoundaryChannel = { postMessage: vi.fn(), close: vi.fn(), onmessage: null }
        const session = new AuthSession({ channelFactory: () => channel })
        const pending = deferred<InvitationPreview>()
        let signal: AbortSignal | undefined
        const api = apiStub()
        api.preview = vi.fn((_token: string, operationSignal: AbortSignal) => {
            signal = operationSignal
            return pending.promise
        })
        mount(api, true, session)
        expect(screen.getByText('Loading your invitation…')).toBeVisible()
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)

        act(() => {
            channel.onmessage?.(new MessageEvent('message', { data: { reason: 'principal-replaced' } }))
        })
        expect(signal?.aborted).toBe(true)
        expect(screen.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
        await act(async () => {
            pending.resolve(preview)
            await pending.promise
        })

        expect(screen.queryByText(preview.organizationName)).not.toBeInTheDocument()
        expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument()
        expect(api.preview).toHaveBeenCalledOnce()
        expect(api.accept).not.toHaveBeenCalled()
        expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
        expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0)
    })

    it('sanitizes path, query, fragment and history state before preview and never exposes the token in markup', async () => {
        const api = apiStub()
        const { token } = mount(api)
        await screen.findByText(preview.organizationName)
        expect(window.location.pathname).toBe('/accept-invitation')
        expect(window.location.search + window.location.hash).toBe('')
        expect(window.history.state).toBeNull()
        expect(document.body.textContent?.includes(token)).toBe(false)
        expect(takeInvitationToken()).toBeUndefined()
        expect(api.preview).toHaveBeenCalledOnce()
    })

    it('uses the same human-readable role label as team management', async () => {
        const api = apiStub()
        api.preview = vi.fn().mockResolvedValue({ ...preview, role: 'admin' })
        mount(api)
        expect(await screen.findByText('Administrator')).toBeVisible()
    })

    it('requires 12 characters, focuses the field, prevents duplicate submission and discards acceptance details', async () => {
        const api = apiStub()
        const pending = deferred<void>()
        api.accept = vi.fn().mockReturnValue(pending.promise)
        mount(api)
        const password = await screen.findByLabelText<HTMLInputElement>('Password', { exact: true })
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Accept invitation' })).toHaveFocus())
        fireEvent.change(password, { target: { value: 'short' } })
        fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
        expect(password).toHaveFocus()
        expect(password).toHaveAttribute('aria-invalid', 'true')
        expect(api.accept).not.toHaveBeenCalled()
        fireEvent.change(password, { target: { value: crypto.randomUUID() } })
        fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
        expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeDisabled()
        expect(password.value.length).toBe(0)
        fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
        expect(api.accept).toHaveBeenCalledOnce()
        await act(() => {
            pending.resolve()
            return pending.promise
        })
        expect(screen.getByRole('heading', { name: 'Invitation accepted' })).toHaveFocus()
        expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/v1/auth/login?destination=%2Fapp',
        )
    })

    it.each(['unknown', 'expired', 'consumed', 'unavailable'] as const)(
        'renders a generic %s preview outcome without PII',
        async reason => {
            const api = apiStub()
            api.preview = vi.fn().mockRejectedValue(new InvitationRequestError(reason))
            mount(api)
            await waitFor(() => expect(screen.queryByText('Loading your invitation…')).not.toBeInTheDocument())
            expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
            expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible()
        },
    )

    it.each(['conflict', 'invalid', 'unavailable'] as const)(
        'clears password, token and preview after %s acceptance',
        async reason => {
            const api = apiStub()
            api.accept = vi.fn().mockRejectedValue(new InvitationRequestError(reason))
            mount(api)
            const password = await screen.findByLabelText<HTMLInputElement>('Password', { exact: true })
            fireEvent.change(password, { target: { value: crypto.randomUUID() } })
            fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
            await waitFor(() => expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument())
            expect(password.value.length).toBe(0)
            expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
            expect(api.accept).toHaveBeenCalledOnce()
        },
    )

    it.each(['resolve', 'reject'] as const)(
        'ignores delayed preview %s after pagehide and persisted pageshow',
        async settlement => {
            const pending = deferred<InvitationPreview>()
            const api = apiStub()
            api.preview = vi.fn().mockReturnValue(pending.promise)
            mount(api)
            act(() => {
                window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
                window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
            })
            expect(screen.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
            await act(async () => {
                if (settlement === 'resolve') pending.resolve(preview)
                else pending.reject(new Error('Delayed request failed'))
                await pending.promise.catch(() => undefined)
            })
            expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
            expect(api.preview).toHaveBeenCalledOnce()
        },
    )

    it.each(['dismiss', 'pagehide', 'unmount'] as const)('ignores delayed acceptance following %s', async boundary => {
        const pending = deferred<void>()
        const api = apiStub()
        api.accept = vi.fn().mockReturnValue(pending.promise)
        const view = mount(api)
        const password = await screen.findByLabelText<HTMLInputElement>('Password', { exact: true })
        fireEvent.change(password, { target: { value: crypto.randomUUID() } })
        fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
        if (boundary === 'dismiss') fireEvent.click(screen.getByRole('button', { name: 'Dismiss invitation' }))
        else if (boundary === 'unmount') view.unmount()
        else
            act(() => {
                window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
                window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
            })
        await act(() => {
            pending.resolve()
            return pending.promise
        })
        expect(screen.queryByText(preview.email)).not.toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Invitation accepted' })).not.toBeInTheDocument()
    })

    it('masks passwords by default and provides a keyboard-operable visibility control', async () => {
        const user = userEvent.setup()
        mount(apiStub())
        const password = await screen.findByLabelText<HTMLInputElement>('Password', { exact: true })
        expect(password).toHaveAttribute('type', 'password')
        await user.click(screen.getByRole('button', { name: 'Show password' }))
        expect(password).toHaveAttribute('type', 'text')
        await user.click(screen.getByRole('button', { name: 'Hide password' }))
        expect(password).toHaveAttribute('type', 'password')
    })

    it('makes a refreshed sanitized route safe without sending an API request', () => {
        const api = apiStub()
        mount(api, false)
        expect(screen.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
        expect(api.preview).not.toHaveBeenCalled()
    })
})
