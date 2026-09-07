import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { useBillingQueries, useCheckout } from './use-billing'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
afterEach(() => vi.unstubAllGlobals())

it('a superseded recovery cannot unlock a newer checkout', async () => {
    vi.stubGlobal('Request', BrowserRequest)
    let posts = 0
    const session = new AuthSession({
        channelFactory: () => null,
        readCookies: () => 'lef_csrf_token=csrf-fixture',
        fetch: (request: Request) => {
            if (request.method === 'POST') {
                posts += 1
                return posts === 1 ? Promise.reject(new Error('network')) : new Promise<Response>(() => undefined)
            }
            const path = new URL(request.url).pathname
            if (path === '/v1/auth/session')
                return Promise.resolve(
                    Response.json({
                        email: 'owner@example.test',
                        membership: { id: 'owner', role: 'owner' },
                        organization: { id: 'organization-a', name: 'Example workspace' },
                        capabilities: ['billing.read', 'billing.manage'],
                        grantableServiceClientPermissions: [],
                    }),
                )
            return Promise.resolve(Response.json(path === '/v1/billing/summary' ? { balance: 25 } : []))
        },
    })
    await session.bootstrap()
    const recoveries: Array<(result: { balance: boolean; history: boolean }) => void> = []
    const refresh = vi.fn(
        () => new Promise<{ balance: boolean; history: boolean }>(resolve => recoveries.push(resolve)),
    )
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider session={session}>{children}</AuthProvider>
    const { result } = renderHook(() => useCheckout({ ...useBillingQueries('organization-a'), refresh }), { wrapper })
    act(() => result.current.start('starter'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const older = recoveries[0]
    let newer: Promise<void>
    act(() => {
        newer = result.current.refreshAfterFailure()
    })
    await act(async () => {
        recoveries[1]({ balance: true, history: true })
        await newer
    })
    act(() => result.current.start('starter'))
    await waitFor(() => expect(posts).toBe(2))
    await act(() => {
        older({ balance: true, history: true })
        return Promise.resolve()
    })
    expect(result.current.selectedPack).toBe('starter')
    act(() => result.current.start('starter'))
    expect(posts).toBe(2)
})
