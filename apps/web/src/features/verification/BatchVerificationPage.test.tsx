import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentAccount } from '../../api/current-account'
import { ForbiddenPage, ProtectedApplication, SessionExpiredPage } from '../../app/AuthRoutes'
import { BatchVerificationJobPage } from '../../routes/BatchVerificationJobPage'
import { BatchVerificationPage } from '../../routes/BatchVerificationPage'
import { AuthProvider } from '../auth/AuthProvider'
import { AuthSession } from '../auth/auth-session'
import { batchCsvExample } from './batch-csv-example'
import { batchVerificationQueryKeys } from './batch-verification-api'
import { billingQueryKeys } from '../billing/billing-api'

const NativeRequest = globalThis.Request
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, document.baseURI) : input, init)
    }
}
beforeEach(() => vi.stubGlobal('Request', BrowserRequest))
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    onlineManager.setOnline(true)
})

const account: CurrentAccount = {
    email: 'owner@example.test',
    membership: { id: 'owner-a', role: 'owner' },
    organization: { id: 'organization-a', name: 'Example workspace' },
    capabilities: ['verification.run', 'verification.read', 'billing.read'],
    grantableServiceClientPermissions: [],
}
const id = '12345678-1234-4234-8234-123456789012'
const uploadPath = '/verifyBatch/csv'
const statusPath = `/verifyBatch/${id}`
const resultPath = `${statusPath}/results`
const formRoute = '/app/verifications/batches/new'
const jobRoute = `/app/verifications/batches/${id}`
const zeroCounts = {
    totalRows: 0,
    uniqueAddresses: 0,
    duplicateRows: 0,
    cachedAddresses: 0,
    sharedAddresses: 0,
    cooldownAddresses: 0,
    completedAddresses: 0,
    conclusiveAddresses: 0,
    inconclusiveAddresses: 0,
    failedAddresses: 0,
}
const zeroBilling = { state: 'pending' as const, reserved: 0, charged: 0 }
const queued = {
    id,
    status: 'queued',
    progress: 0,
    total: 0,
    processed: 0,
    unprocessed: 0,
    resultsAvailable: false,
    counts: zeroCounts,
    billing: zeroBilling,
}
const running = {
    id,
    status: 'running',
    progress: 37.5,
    total: 8,
    processed: 3,
    unprocessed: 5,
    resultsAvailable: false,
    counts: { ...zeroCounts, totalRows: 8, uniqueAddresses: 8, completedAddresses: 3, conclusiveAddresses: 3 },
    billing: { state: 'pending' as const, reserved: 3, charged: 3 },
}
const completed = {
    ...running,
    status: 'completed',
    progress: 100,
    processed: 8,
    unprocessed: 0,
    resultsAvailable: true,
    counts: { ...running.counts, completedAddresses: 8, conclusiveAddresses: 8 },
    billing: { state: 'settled' as const, reserved: 8, charged: 8 },
}
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => {
        resolve = done
    })
    return { promise, resolve }
}
function csv(name = 'synthetic.csv', type = '') {
    return new File(['email\nsynthetic@example.test\n'], name, { type })
}
function renderBatch({
    path = formRoute,
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
            return Promise.resolve(Response.json({ balance: 10, reserved: 3, available: 7 }))
        if (path === uploadPath) return Promise.resolve(Response.json({ id }, { status: 202 }))
        if (path === statusPath) return Promise.resolve(Response.json(queued))
        if (path === resultPath)
            return Promise.resolve(
                new Response('email,exists\nsynthetic@example.test,true\n', {
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': `attachment; filename="batch-verification-${id}.csv"`,
                    },
                }),
            )
        if (path === '/v1/auth/logout') return Promise.resolve(new Response(null, { status: 204 }))
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
                            { path: formRoute, element: <BatchVerificationPage /> },
                            { path: '/app/verifications/batches/:id', element: <BatchVerificationJobPage /> },
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
    return { fetch, session, router, ...render(<RouterProvider router={router} />) }
}
function requestsFor(fetch: ReturnType<typeof renderBatch>['fetch'], path: string, method = 'GET') {
    return fetch.mock.calls
        .map(([request]) => request)
        .filter(request => new URL(request.url).pathname === path && request.method === method)
}
async function select(file = csv()) {
    const input = await screen.findByLabelText<HTMLInputElement>('CSV file')
    await userEvent.upload(input, file, { applyAccept: false })
    return input
}
async function submit(file = csv()) {
    const input = await select(file)
    await userEvent.click(screen.getByRole('button', { name: 'Upload and verify CSV' }))
    return input
}
function expectNoFilesInCaches(session: AuthSession, filename = 'synthetic.csv') {
    expect(session.queryClient.getMutationCache().getAll()).toHaveLength(0)
    const snapshots = session.queryClient
        .getQueryCache()
        .getAll()
        .map(query => query.state)
    expect(JSON.stringify(snapshots)).not.toContain(filename)
    expect(JSON.stringify(snapshots)).not.toContain('synthetic@example.test')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
}

describe('CSV batch selection and upload', () => {
    it('explains the format before selection and retains no file in shared caches', async () => {
        const { session } = renderBatch()
        const input = await screen.findByLabelText('CSV file')
        expect(input).toHaveAttribute('accept', '.csv,text/csv')
        expect(input).toHaveAccessibleDescription(
            'Choose one .csv file, up to 100 MB (104,857,600 bytes). Use a header named email (lowercase), followed by one email address per row.',
        )
        const example = screen.getByRole('group', { name: 'CSV format example' })
        expect(within(example).getByText('Replace the example addresses with your own.')).toBeInTheDocument()
        const code = example.querySelector('pre > code')
        expect(code?.textContent).toBe(batchCsvExample)
        expect(batchCsvExample.split('\n')).toEqual(['email', 'alice@example.com', 'bob@example.com', ''])
        expect(example.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        const sample = within(example).getByRole('link', { name: 'Download sample CSV' })
        expect(sample).toHaveAttribute('download', 'batch-verification-sample.csv')
        const href = sample.getAttribute('href')!
        const prefix = 'data:text/csv;charset=utf-8,'
        expect(href.startsWith(prefix)).toBe(true)
        const downloaded = decodeURIComponent(href.slice(prefix.length))
        expect(downloaded).toBe('email\nalice@example.com\nbob@example.com\n')
        expect(downloaded).toBe(code?.textContent)
        await select()
        expect(screen.getByText(/synthetic.csv.*bytes/)).toBeInTheDocument()
        expectNoFilesInCaches(session)
        await userEvent.click(screen.getByRole('button', { name: 'Remove file' }))
        expect(input).toHaveValue('')
        expect(input).toHaveFocus()
        expect(screen.queryByText(/synthetic.csv/)).not.toBeInTheDocument()
    })
    const sampleLink = () => screen.getByRole('link', { name: 'Download sample CSV' })
    it('keeps the sample download available after going offline', async () => {
        renderBatch()
        await screen.findByLabelText('CSV file')
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        expect(screen.getByText(/You are offline/)).toBeInTheDocument()
        expect(sampleLink()).toHaveAttribute('download', 'batch-verification-sample.csv')
    })
    it('keeps the sample download available while uploading', async () => {
        const pending = deferred<Response>()
        renderBatch({
            intercept: request => (new URL(request.url).pathname === uploadPath ? pending.promise : undefined),
        })
        await submit()
        expect(await screen.findByRole('progressbar', { name: 'Uploading CSV' })).toBeInTheDocument()
        expect(sampleLink()).toHaveAttribute('download', 'batch-verification-sample.csv')
        expect(sampleLink()).not.toHaveAttribute('aria-disabled')
    })
    it('keeps the sample download available after an uncertain upload', async () => {
        const { fetch } = renderBatch({
            intercept: request =>
                new URL(request.url).pathname === uploadPath ? Promise.reject(new Error('disconnect')) : undefined,
        })
        await submit()
        expect(await screen.findByRole('heading', { name: 'Upload could not be confirmed' })).toBeInTheDocument()
        expect(sampleLink()).toHaveAttribute('download', 'batch-verification-sample.csv')
        expect(screen.getByRole('checkbox')).not.toBeChecked()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
    })
    it.each(['synthetic.txt', 'synthetic.csv.exe'])('rejects the wrong extension %s before POST', async name => {
        const { fetch } = renderBatch()
        const input = await select(csv(name, 'text/csv'))
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).toHaveAccessibleDescription(/\.csv extension/)
        expect(input).toHaveValue('')
        expect(input).toHaveFocus()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it('rejects more than 100 MB without reading contents', async () => {
        const { fetch } = renderBatch()
        const file = csv()
        Object.defineProperty(file, 'size', { value: 104857601 })
        const input = await select(file)
        expect(input).toHaveAccessibleDescription(/exceeds 100 MB/)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it('accepts the exact byte boundary and an empty MIME value', async () => {
        const { fetch, router } = renderBatch()
        const file = csv('synthetic.CSV')
        Object.defineProperty(file, 'size', { value: 104857600 })
        const input = await submit(file)
        expect(await screen.findByRole('heading', { name: 'Batch verification queued' })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(jobRoute)
        expect(input).toHaveValue('')
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
    })
    it('blocks duplicate activation and replacement while showing indeterminate upload progress', async () => {
        const pending = deferred<Response>()
        const { fetch, session } = renderBatch({
            intercept: request => (new URL(request.url).pathname === uploadPath ? pending.promise : undefined),
        })
        const input = await submit()
        expect(await screen.findByRole('progressbar', { name: 'Uploading CSV' })).not.toHaveAttribute('aria-valuenow')
        expect(input).toBeDisabled()
        const button = screen.getByRole('button', { name: 'Upload and verify CSV' })
        expect(button).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Replace file' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Remove file' })).toBeDisabled()
        fireEvent.submit(button.closest('form')!)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
        expectNoFilesInCaches(session)
        await act(async () => {
            pending.resolve(Response.json({ id }, { status: 202 }))
            await pending.promise
        })
        expect(await screen.findByRole('heading', { name: 'Batch verification queued' })).toBeInTheDocument()
        expect(input.files).toHaveLength(0)
        expectNoFilesInCaches(session)
    })
    it('clears rejected file references and associates authoritative validation recovery with the picker', async () => {
        const { fetch, session } = renderBatch({
            intercept: request =>
                new URL(request.url).pathname === uploadPath
                    ? Response.json({ message: 'private parser details' }, { status: 422 })
                    : undefined,
        })
        const input = await submit()
        await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
        expect(input).toHaveAccessibleDescription(/server could not accept/)
        expect(input).toHaveValue('')
        expect(input).toHaveFocus()
        expect(document.body.textContent).not.toMatch(/private parser|synthetic.csv/)
        expectNoFilesInCaches(session)
        await userEvent.click(screen.getByRole('button', { name: 'Upload and verify CSV' }))
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
    })
    it('never retries an uncertain upload and requires acknowledgment plus fresh selection', async () => {
        const { fetch, session } = renderBatch({
            intercept: request =>
                new URL(request.url).pathname === uploadPath
                    ? Promise.reject(new Error('private disconnect'))
                    : undefined,
        })
        const input = await submit()
        expect(await screen.findByRole('heading', { name: 'Upload could not be confirmed' })).toHaveFocus()
        expect(screen.getByText(/job may still validate and charge/)).toBeInTheDocument()
        expect(input).toHaveValue('')
        expect(input).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Choose a fresh file' })).toBeDisabled()
        expectNoFilesInCaches(session)
        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Choose a fresh file' }))
        expect(input).toBeEnabled()
        expect(input).toHaveFocus()
        await userEvent.click(screen.getByRole('button', { name: 'Upload and verify CSV' }))
        expect(input).toHaveAccessibleDescription(/Choose a CSV file before uploading/)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
        expect(document.body.textContent).not.toContain('private disconnect')
    })
    it.each(['pagehide', 'unmount'])('releases file references on %s and ignores the late upload', async boundary => {
        const delayed = deferred<Response>()
        const { fetch, router, session } = renderBatch({
            intercept: request => (new URL(request.url).pathname === uploadPath ? delayed.promise : undefined),
        })
        const input = await submit()
        await waitFor(() => expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1))
        if (boundary === 'pagehide') await act(() => window.dispatchEvent(new Event('pagehide')))
        else await act(() => router.navigate('/outside'))
        expect(input.files).toHaveLength(0)
        expect(requestsFor(fetch, uploadPath, 'POST')[0].signal.aborted).toBe(true)
        await act(async () => {
            delayed.resolve(Response.json({ id }, { status: 202 }))
            await delayed.promise
        })
        expect(router.state.location.pathname).toBe(boundary === 'pagehide' ? formRoute : '/outside')
        if (boundary === 'pagehide') {
            // The authentication boundary clears the whole UI before the BFcache snapshot.
            expect(screen.getByRole('heading', { name: 'Opening your workspace' })).toBeInTheDocument()
            const restored = new Event('pageshow')
            Object.defineProperty(restored, 'persisted', { value: true })
            await act(() => window.dispatchEvent(restored))
            expect(await screen.findByLabelText('CSV file')).toHaveValue('')
            expect(screen.queryByText(/synthetic.csv/)).not.toBeInTheDocument()
        }
        expectNoFilesInCaches(session)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
    })
    it.each([401, 403])('uses shared shell recovery for upload HTTP %s', async status => {
        renderBatch({
            intercept: request =>
                new URL(request.url).pathname === uploadPath ? new Response(null, { status }) : undefined,
        })
        await submit()
        expect(
            await screen.findByRole('heading', { name: status === 401 ? 'Your session has expired' : 'Access denied' }),
        ).toBeInTheDocument()
    })
    it('hides the upload navigation and denies direct entry without the run capability', async () => {
        const { fetch } = renderBatch({ capabilities: ['verification.read'] })
        expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Verify a CSV file' })).not.toBeInTheDocument()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it('allows a zero available balance to submit cached work', async () => {
        const { session, fetch } = renderBatch()
        await screen.findByLabelText('CSV file')
        session.queryClient.setQueryData(billingQueryKeys.summary(account.organization.id), {
            balance: 0,
            reserved: 0,
            available: 0,
        })
        await submit()
        expect(await screen.findByRole('heading', { name: 'Batch verification queued' })).toBeInTheDocument()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
    })
    it.each([true, false])(
        'refreshes a confirmed funding rejection only with billing permission: %s',
        async canReadBilling => {
            const { fetch, session } = renderBatch({
                capabilities: canReadBilling ? account.capabilities : ['verification.run', 'verification.read'],
                intercept: request =>
                    new URL(request.url).pathname === uploadPath ? new Response(null, { status: 402 }) : undefined,
            })
            await submit()
            expect(await screen.findByText(/server could not fund this batch/)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Upload and verify CSV' })).toBeEnabled()
            if (canReadBilling) {
                expect(screen.getByRole('link', { name: 'Go to billing' })).toBeInTheDocument()
                await waitFor(() =>
                    expect(session.queryClient.getQueryData(billingQueryKeys.summary(account.organization.id))).toEqual(
                        { balance: 10, reserved: 3, available: 7 },
                    ),
                )
            } else {
                expect(screen.getByText(/Contact an organization owner/)).toBeInTheDocument()
                expect(screen.queryByRole('link', { name: 'Go to billing' })).not.toBeInTheDocument()
            }
            expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(canReadBilling ? 1 : 0)
            expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
        },
    )
    it('shows the server retry time and waits for deliberate upload after 429', async () => {
        const { fetch } = renderBatch({
            intercept: request =>
                new URL(request.url).pathname === uploadPath
                    ? new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
                    : undefined,
        })
        await select()
        vi.useFakeTimers()
        const button = screen.getByRole('button', { name: 'Upload and verify CSV' })
        fireEvent.click(button)
        await tick(10)
        expect(screen.getByText(/You can retry after.*UTC/)).toBeInTheDocument()
        expect(button).toBeDisabled()
        await tick(30_010)
        expect(button).toBeEnabled()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(1)
        fireEvent.click(button)
        await tick(10)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(2)
    })
})

describe('batch job status and recovery', () => {
    it('uses exact progress and authoritative counts without an ETA', async () => {
        renderBatch({
            path: jobRoute,
            intercept: request => (new URL(request.url).pathname === statusPath ? Response.json(running) : undefined),
        })
        const progress = await screen.findByRole('progressbar')
        expect(progress).toHaveAttribute('aria-valuenow', '37.5')
        for (const [label, value] of [
            ['Processed', '3'],
            ['Unprocessed', '5'],
            ['Total rows', '8'],
            ['Unique addresses', '8'],
            ['Duplicate rows', '0'],
            ['Cached addresses', '0'],
            ['Shared addresses', '0'],
        ])
            expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value)
        expect(document.body.textContent).not.toMatch(/ETA|seconds remaining/)
        expect(screen.getByText('3 credits initially reserved')).toBeInTheDocument()
        expect(screen.getByText('3 credits charged so far')).toBeInTheDocument()
        expect(screen.getByText('Settlement pending')).toBeInTheDocument()
    })
    it('describes validation while zero counts are provisional', async () => {
        renderBatch({ path: jobRoute })
        expect(await screen.findByText(/zero counts do not mean the file is empty/)).toBeInTheDocument()
        expect(screen.getByText('0 credits initially reserved')).toBeInTheDocument()
        expect(screen.getByText('Final charge pending')).toBeInTheDocument()
        expect(screen.getByText(/Credit accounting is still pending/)).toBeInTheDocument()
        expect(screen.queryByText(/Credits were set aside for this operation/)).not.toBeInTheDocument()
        expect(screen.queryByText('No credits charged')).not.toBeInTheDocument()
    })
    it.each(['invalid_csv', 'insufficient_credits', 'processing_failed'])(
        'renders reviewed %s recovery only',
        async failureCode => {
            const { session } = renderBatch({
                path: jobRoute,
                intercept: request =>
                    new URL(request.url).pathname === statusPath
                        ? Response.json({
                              ...queued,
                              status: 'failed',
                              failureCode,
                              failedReason: 'private queue data',
                          })
                        : undefined,
            })
            const title = {
                invalid_csv: 'CSV validation failed',
                insufficient_credits: 'Insufficient credits',
                processing_failed: 'Batch processing failed',
            }[failureCode]
            expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Download result CSV' })).not.toBeInTheDocument()
            if (failureCode === 'invalid_csv')
                expect(screen.getByRole('link', { name: 'Choose a fresh file' })).toHaveAttribute('href', formRoute)
            else expect(screen.queryByRole('link', { name: 'Choose a fresh file' })).not.toBeInTheDocument()
            if (failureCode === 'insufficient_credits')
                expect(screen.getByRole('link', { name: 'Go to billing' })).toHaveAttribute('href', '/app/billing')
            if (failureCode === 'processing_failed')
                expect(screen.getByText(/Review the confirmed charges below/)).toBeInTheDocument()
            expect(
                JSON.stringify(
                    session.queryClient.getQueryData(batchVerificationQueryKeys.job(account.organization.id, id)),
                ),
            ).not.toContain('private')
            expect(document.body.textContent).not.toContain('private')
        },
    )
    it('advises contacting an owner when billing permission is absent', async () => {
        renderBatch({
            path: jobRoute,
            capabilities: ['verification.read'],
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ ...queued, status: 'failed', failureCode: 'insufficient_credits' })
                    : undefined,
        })
        expect(await screen.findByText(/Contact an organization owner/)).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Go to billing' })).not.toBeInTheDocument()
    })
    it.each(['not-a-uuid', id])('conceals inaccessible work for %s', async routeId => {
        const { fetch } = renderBatch({
            path: `/app/verifications/batches/${routeId}`,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ message: 'private organization' }, { status: 404 })
                    : undefined,
        })
        expect(await screen.findByRole('heading', { name: 'Batch verification not found' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument()
        expect(requestsFor(fetch, statusPath)).toHaveLength(routeId === id ? 1 : 0)
        expect(document.body.textContent).not.toContain('private')
    })
    it.each([401, 403])('uses shell recovery for status HTTP %s', async status => {
        renderBatch({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath ? new Response(null, { status }) : undefined,
        })
        expect(
            await screen.findByRole('heading', { name: status === 401 ? 'Your session has expired' : 'Access denied' }),
        ).toBeInTheDocument()
    })
    it.each(['error', 'unavailable'])('retains confirmed counts as stale after %s and only retries GET', async next => {
        let stale = false
        const { fetch } = renderBatch({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? stale
                        ? next === 'error'
                            ? new Response(null, { status: 500 })
                            : Response.json({ ...queued, status: 'unavailable' })
                        : Response.json(running)
                    : undefined,
        })
        await screen.findByRole('heading', { name: 'Batch verification running' })
        stale = true
        const refresh = screen.getByRole('button', { name: 'Refresh status' })
        await userEvent.click(refresh)
        expect(
            await screen.findByText('Last confirmed progress, counts, and charges — out of date'),
        ).toBeInTheDocument()
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37.5')
        expect(screen.getByText('Processed').nextElementSibling).toHaveTextContent('3')
        expect(refresh).toHaveFocus()
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it.each([true, false])(
        'refreshes the authoritative summary at settlement only with billing permission: %s',
        async canReadBilling => {
            let settled = false
            const { fetch, session } = renderBatch({
                path: jobRoute,
                capabilities: canReadBilling ? account.capabilities : ['verification.read'],
                intercept: request =>
                    new URL(request.url).pathname === statusPath
                        ? Response.json(settled ? completed : running)
                        : undefined,
            })
            await screen.findByRole('heading', { name: 'Batch verification running' })
            expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(0)
            settled = true
            const refresh = screen.getByRole('button', { name: 'Refresh status' })
            await userEvent.click(refresh)
            expect(await screen.findByText('8 credits charged')).toBeInTheDocument()
            expect(refresh).toHaveFocus()
            expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(canReadBilling ? 1 : 0)
            if (canReadBilling)
                expect(session.queryClient.getQueryData(billingQueryKeys.summary(account.organization.id))).toEqual({
                    balance: 10,
                    reserved: 3,
                    available: 7,
                })
            await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
            expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(canReadBilling ? 1 : 0)
        },
    )
    it('preserves exact row accounting and settled charges when a failed batch has no downloadable results', async () => {
        renderBatch({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({
                          ...completed,
                          status: 'failed',
                          failureCode: 'processing_failed',
                          resultsAvailable: false,
                          counts: {
                              ...zeroCounts,
                              totalRows: 100,
                              uniqueAddresses: 80,
                              duplicateRows: 20,
                              cachedAddresses: 20,
                              sharedAddresses: 5,
                          },
                          billing: { state: 'settled', reserved: 0, charged: 45 },
                      })
                    : undefined,
        })
        await screen.findByRole('heading', { name: 'Batch processing failed' })
        for (const [label, value] of [
            ['Total rows', '100'],
            ['Unique addresses', '80'],
            ['Duplicate rows', '20'],
            ['Cached addresses', '20'],
            ['Shared addresses', '5'],
        ]) {
            expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value)
        }
        expect(screen.getByText('45 credits charged')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Download result CSV' })).not.toBeInTheDocument()
        expect(screen.getByText(/Results are unavailable for this failed batch/)).toBeInTheDocument()
        expect(screen.getByText(/retains every original row, including duplicates/)).toBeInTheDocument()
        expect(screen.queryByText('No credits charged')).not.toBeInTheDocument()
    })
    it('shows confirmed free settled work without inferring charges from processed counts', async () => {
        renderBatch({
            path: jobRoute,
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json({ ...completed, billing: { state: 'settled', reserved: 0, charged: 0 } })
                    : undefined,
        })
        expect(await screen.findByText('No credits charged')).toBeInTheDocument()
        expect(screen.getByText('Processed').nextElementSibling).toHaveTextContent('8')
    })
    it('discards a late settlement balance refresh after sign-out', async () => {
        const delayed = deferred<Response>()
        const { session, fetch } = renderBatch({
            path: jobRoute,
            intercept: request => {
                const path = new URL(request.url).pathname
                if (path === statusPath) return Response.json(completed)
                if (path === '/v1/billing/summary') return delayed.promise
            },
        })
        expect(await screen.findByText('8 credits charged')).toBeInTheDocument()
        await waitFor(() => expect(requestsFor(fetch, '/v1/billing/summary')).toHaveLength(1))
        await act(() => session.signOut())
        await act(async () => {
            delayed.resolve(Response.json({ balance: 99, reserved: 0, available: 99 }))
            await delayed.promise
        })
        expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0)
        expect(screen.queryByText('8 credits charged')).not.toBeInTheDocument()
        expect(requestsFor(fetch, '/v1/billing/summary')[0].signal.aborted).toBe(true)
    })
})

describe('completed result download', () => {
    function completedView(intercept?: NonNullable<Parameters<typeof renderBatch>[0]>['intercept']) {
        return renderBatch({
            path: jobRoute,
            intercept: request =>
                intercept?.(request) ??
                (new URL(request.url).pathname === statusPath ? Response.json(completed) : undefined),
        })
    }
    function mockDownload() {
        const create = vi.fn(() => 'blob:synthetic-result')
        const revoke = vi.fn()
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        return { create, revoke, click }
    }
    it('downloads once per activation, revokes the object URL, and preserves completion focus on refresh', async () => {
        const { create, revoke, click } = mockDownload()
        const { fetch, session } = completedView()
        expect(await screen.findByRole('heading', { name: 'Result CSV' })).toHaveFocus()
        await userEvent.click(screen.getByRole('button', { name: 'Download result CSV' }))
        expect(await screen.findByText(/Result CSV download requested/)).toBeInTheDocument()
        expect(create).toHaveBeenCalledTimes(1)
        expect(click).toHaveBeenCalledTimes(1)
        expect(revoke).toHaveBeenCalledWith('blob:synthetic-result')
        expect(document.querySelector('a[download]')).toBeNull()
        const refresh = screen.getByRole('button', { name: 'Refresh status' })
        await userEvent.click(refresh)
        await waitFor(() => expect(refresh).toBeEnabled())
        expect(refresh).toHaveFocus()
        expect(requestsFor(fetch, resultPath)).toHaveLength(1)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
        expectNoFilesInCaches(session)
    })
    it('allows retry of a failed download using GET without changing the completed job', async () => {
        mockDownload()
        let failed = true
        const { fetch } = completedView(request =>
            new URL(request.url).pathname === resultPath && failed ? new Response(null, { status: 503 }) : undefined,
        )
        await userEvent.click(await screen.findByRole('button', { name: 'Download result CSV' }))
        expect(await screen.findByText(/result could not be downloaded/)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Batch verification completed' })).toBeInTheDocument()
        failed = false
        await userEvent.click(screen.getByRole('button', { name: 'Download result CSV' }))
        expect(await screen.findByText(/Result CSV download requested/)).toBeInTheDocument()
        expect(requestsFor(fetch, resultPath)).toHaveLength(2)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it('conceals a later download 404 and stops offering download for that attempt', async () => {
        const { create } = mockDownload()
        completedView(request =>
            new URL(request.url).pathname === resultPath ? new Response(null, { status: 404 }) : undefined,
        )
        await userEvent.click(await screen.findByRole('button', { name: 'Download result CSV' }))
        expect(await screen.findByRole('heading', { name: 'Result no longer available' })).toHaveFocus()
        expect(screen.queryByRole('button', { name: 'Download result CSV' })).not.toBeInTheDocument()
        expect(create).not.toHaveBeenCalled()
        expect(screen.getByRole('heading', { name: 'Batch verification completed' })).toBeInTheDocument()
    })
    it('blocks duplicate downloads and ignores late result data after page departure', async () => {
        const { create } = mockDownload()
        const delayed = deferred<Response>()
        const { fetch, router } = completedView(request =>
            new URL(request.url).pathname === resultPath ? delayed.promise : undefined,
        )
        const button = await screen.findByRole('button', { name: 'Download result CSV' })
        await userEvent.click(button)
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(requestsFor(fetch, resultPath)).toHaveLength(1)
        await act(() => router.navigate('/outside'))
        await act(async () => {
            delayed.resolve(new Response('synthetic', { headers: { 'Content-Type': 'text/csv' } }))
            await delayed.promise
        })
        expect(create).not.toHaveBeenCalled()
        expect(requestsFor(fetch, resultPath)[0].signal.aborted).toBe(true)
    })
})

async function tick(milliseconds = 1) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds)
    })
}
async function timedJob(options: Parameters<typeof renderBatch>[0] = {}) {
    vi.useFakeTimers()
    const view = renderBatch({ path: jobRoute, ...options })
    for (let check = 0; check < 8; check += 1) await tick()
    return view
}
describe('batch polling lifecycle', () => {
    it('polls only queued and running states and stops on completion', async () => {
        let checks = 0
        const { fetch } = await timedJob({
            intercept: request =>
                new URL(request.url).pathname === statusPath
                    ? Response.json(++checks === 1 ? queued : checks === 2 ? running : completed)
                    : undefined,
        })
        await tick(5005)
        expect(screen.getByRole('heading', { name: 'Batch verification running' })).toBeInTheDocument()
        await tick(5005)
        expect(screen.getByRole('heading', { name: 'Batch verification completed' })).toBeInTheDocument()
        await tick(60_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(3)
        expect(requestsFor(fetch, uploadPath, 'POST')).toHaveLength(0)
    })
    it.each(['failed', 'unavailable'])('stops polling terminal %s', async status => {
        const { fetch } = await timedJob({
            intercept: request =>
                new URL(request.url).pathname === statusPath ? Response.json({ ...queued, status }) : undefined,
        })
        await tick(60_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
    })
    it('pauses while hidden and offline, retains counts, then resumes when available', async () => {
        const { fetch } = await timedJob()
        const visibility = vi.spyOn(document, 'visibilityState', 'get')
        const online = vi.spyOn(navigator, 'onLine', 'get')
        visibility.mockReturnValue('hidden')
        await act(() => document.dispatchEvent(new Event('visibilitychange')))
        await tick(20_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(1)
        visibility.mockReturnValue('visible')
        await act(() => document.dispatchEvent(new Event('visibilitychange')))
        await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
        online.mockReturnValue(false)
        await act(() => window.dispatchEvent(new Event('offline')))
        await tick(20_000)
        expect(screen.getByRole('heading', { name: 'Batch verification offline' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled()
        expect(requestsFor(fetch, statusPath)).toHaveLength(2)
        online.mockReturnValue(true)
        await act(() => window.dispatchEvent(new Event('online')))
        await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(3)
    })
    it('bounds automatic checks until explicit refresh', async () => {
        const { fetch } = await timedJob()
        for (let check = 0; check < 60; check += 1) await tick(5005)
        expect(requestsFor(fetch, statusPath)).toHaveLength(61)
        expect(screen.getByText(/Automatic status checks have paused/)).toBeInTheDocument()
        await tick(30_000)
        expect(requestsFor(fetch, statusPath)).toHaveLength(61)
        act(() => screen.getByRole('button', { name: 'Refresh status' }).click())
        await tick(5)
        expect(requestsFor(fetch, statusPath)).toHaveLength(62)
    })
})
