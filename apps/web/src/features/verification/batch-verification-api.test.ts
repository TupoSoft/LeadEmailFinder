// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, StaleAuthResponseError } from '../../api/api-error'
import { createBrowserApiClient } from '../../api/browser-api-client'
import { createBatchVerification, downloadBatchVerification, readBatchVerification } from './batch-verification-api'

const NativeRequest = globalThis.Request
let requestOptions: RequestInit[] = []
class BrowserRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === 'string' && init) requestOptions.push(init)
        super(typeof input === 'string' ? new URL(input, 'http://localhost') : input, init)
    }
}
beforeEach(() => {
    requestOptions = []
    vi.stubGlobal('Request', BrowserRequest)
})
afterEach(() => vi.unstubAllGlobals())

const id = '11111111-1111-4111-8111-111111111111'
const status = {
    id,
    status: 'running',
    progress: 37.5,
    total: 8,
    processed: 3,
    unprocessed: 5,
    resultsAvailable: false,
    counts: {
        totalRows: 8,
        uniqueAddresses: 8,
        duplicateRows: 0,
        cachedAddresses: 0,
        sharedAddresses: 0,
        cooldownAddresses: 0,
        completedAddresses: 3,
        conclusiveAddresses: 3,
        inconclusiveAddresses: 0,
        failedAddresses: 0,
    },
    billing: { state: 'pending', reserved: 3, charged: 3 },
}
const file = () => new File(['email\nsynthetic@example.test\n'], 'synthetic.csv', { type: '' })
const csvResponse = (headers: Record<string, string> = {}) =>
    new Response('email,exists\nsynthetic@example.test,true\n', {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', ...headers },
    })

describe('batch multipart transport', () => {
    it('sends exactly one FormData file part with a browser-owned boundary, session credentials and CSRF', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(Response.json({ id }, { status: 202 })),
        )
        const api = createBrowserApiClient({ fetch, readCookies: () => 'lef_csrf_token=csrf%2Bvalue' })
        const submitted = file()

        await expect(createBatchVerification(api, submitted)).resolves.toEqual({ id })

        expect(fetch).toHaveBeenCalledTimes(1)
        const request = fetch.mock.calls[0][0]
        expect(request.url).toBe('http://localhost/verifyBatch/csv')
        expect(request.method).toBe('POST')
        expect(request.credentials).toBe('same-origin')
        expect(request.cache).toBe('no-store')
        expect(request.headers.get('x-csrf-token')).toBe('csrf+value')
        expect(request.headers.has('authorization')).toBe(false)
        expect(new Headers(requestOptions[0].headers).has('content-type')).toBe(false)
        expect(requestOptions[0].body).toBeInstanceOf(FormData)
        expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=.+/)
        const entries = [...(await request.formData()).entries()]
        expect(entries).toHaveLength(1)
        expect(entries[0][0]).toBe('file')
        const uploaded = entries[0][1] as File
        expect(uploaded.name).toBe('synthetic.csv')
        expect(uploaded.type).toBe('text/csv')
        expect(await uploaded.text()).toBe(await submitted.text())
    })

    it.each([
        [200, { id }],
        [202, {}],
        [202, { id: 'not-a-job' }],
        [202, { id: 123 }],
    ])('never accepts an unconfirmed upload (%s) or retries it', async (responseStatus, body) => {
        const fetch = vi.fn(() => Promise.resolve(Response.json(body, { status: responseStatus })))
        const api = createBrowserApiClient({ fetch, readCookies: () => '' })
        await expect(createBatchVerification(api, file())).rejects.toBeInstanceOf(ApiError)
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it.each([401, 403, 422, 503])(
        'normalizes upload HTTP %s without retaining provider response details',
        async responseStatus => {
            const fetch = vi.fn(() =>
                Promise.resolve(
                    Response.json({ message: 'private parser or storage detail' }, { status: responseStatus }),
                ),
            )
            const api = createBrowserApiClient({ fetch, readCookies: () => '' })
            const error = await createBatchVerification(api, file()).catch((value: unknown) => value)
            expect(error).toBeInstanceOf(ApiError)
            expect(error).toMatchObject({ status: responseStatus })
            expect(String(error)).not.toContain('private')
            expect(fetch).toHaveBeenCalledTimes(1)
        },
    )

    it('composes caller abandonment with the request timeout without resubmitting', async () => {
        const controller = new AbortController()
        const fetch = vi.fn<(request: Request) => Promise<Response>>(
            request =>
                new Promise((_resolve, reject) => {
                    request.signal.addEventListener('abort', () => reject(new Error('private aborted URL')), {
                        once: true,
                    })
                }),
        )
        const api = createBrowserApiClient({ fetch, readCookies: () => '' })
        const pending = createBatchVerification(api, file(), controller.signal)
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
        controller.abort()
        await expect(pending).rejects.toMatchObject({ status: 0, category: 'request-failed' })
        expect(fetch.mock.calls[0][0].signal.aborted).toBe(true)
        expect(fetch).toHaveBeenCalledTimes(1)
    })
})

describe('batch status transport', () => {
    it('projects only authoritative safe fields and preserves exact progress and counts', async () => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(
                Response.json({ ...status, failureCode: 'invalid_csv', failedReason: 'private queue reason' }),
            ),
        )
        const readCookies = vi.fn(() => 'unused')
        const result = await readBatchVerification(createBrowserApiClient({ fetch, readCookies }), id)
        expect(result).toEqual(status)
        expect(fetch.mock.calls[0][0].url).toBe(`http://localhost/verifyBatch/${id}`)
        expect(fetch.mock.calls[0][0].cache).toBe('no-store')
        expect(readCookies).not.toHaveBeenCalled()
    })

    it.each(['queued', 'running', 'completed', 'unavailable', 'unknown', 'waiting-children'])(
        'omits terminal markers for %s and maps unsupported states to unavailable',
        async current => {
            const api = createBrowserApiClient({
                fetch: () => Promise.resolve(Response.json({ ...status, status: current, failureCode: 'invalid_csv' })),
            })
            expect(await readBatchVerification(api, id)).toEqual({
                ...status,
                status: ['unknown', 'waiting-children'].includes(current) ? 'unavailable' : current,
            })
        },
    )

    it.each(['invalid_csv', 'insufficient_credits', 'processing_failed', 'private error', undefined])(
        'allows only safe terminal failure codes (%s)',
        async failureCode => {
            const api = createBrowserApiClient({
                fetch: () => Promise.resolve(Response.json({ ...status, status: 'failed', failureCode })),
            })
            expect(await readBatchVerification(api, id)).toEqual({
                ...status,
                status: 'failed',
                failureCode: ['invalid_csv', 'insufficient_credits'].includes(failureCode ?? '')
                    ? failureCode
                    : 'processing_failed',
            })
        },
    )

    it.each([
        { progress: -1 },
        { progress: 101 },
        { progress: null },
        { progress: '20' },
        { total: -1 },
        { processed: 0.5 },
        { unprocessed: Number.MAX_SAFE_INTEGER + 1 },
        { id: 'another-job' },
        { resultsAvailable: 'true' },
        { counts: undefined },
        { billing: undefined },
        { billing: { ...status.billing, state: 'unknown' } },
        { counts: { ...status.counts, totalRows: -1 } },
    ])('rejects malformed progress, counts or job identity without estimating values', async changed => {
        const api = createBrowserApiClient({ fetch: () => Promise.resolve(Response.json({ ...status, ...changed })) })
        await expect(readBatchVerification(api, id)).rejects.toMatchObject({ status: 502 })
    })
})

describe('batch result transport', () => {
    it('downloads a CSV Blob using only the authenticated uncached GET and safe server filename', async () => {
        const response = csvResponse({ 'Content-Disposition': 'attachment; filename="batch-results.csv"' })
        const blob = vi.spyOn(response, 'blob')
        const json = vi.spyOn(response, 'json')
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(response))
        const readCookies = vi.fn(() => 'unused')
        const result = await downloadBatchVerification(createBrowserApiClient({ fetch, readCookies }), id)

        expect(result.blob).toBeInstanceOf(Blob)
        expect(result.filename).toBe('batch-results.csv')
        expect(blob).toHaveBeenCalledTimes(1)
        expect(json).not.toHaveBeenCalled()
        expect(fetch).toHaveBeenCalledTimes(1)
        const request = fetch.mock.calls[0][0]
        expect(request.url).toBe(`http://localhost/verifyBatch/${id}/results`)
        expect(request.method).toBe('GET')
        expect(request.credentials).toBe('same-origin')
        expect(request.cache).toBe('no-store')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(readCookies).not.toHaveBeenCalled()
    })

    it.each([
        ['attachment; filename="result.csv"', 'result.csv'],
        ["attachment; filename*=UTF-8''batch%20results.csv", 'batch results.csv'],
        ['attachment; filename="../../private.csv"', 'verification-results.csv'],
        ['attachment; filename="C:\\private.csv"', 'verification-results.csv'],
        ['attachment; filename="result.html"', 'verification-results.csv'],
        ['attachment; filename="CON.csv"', 'verification-results.csv'],
        ['attachment; filename="=formula.csv"', 'verification-results.csv'],
        ["attachment; filename*=UTF-8''%ZZ.csv", 'verification-results.csv'],
        ['inline; filename="result.csv"', 'verification-results.csv'],
        ['', 'verification-results.csv'],
    ])('uses a safe basename for disposition %s', async (disposition, expected) => {
        const api = createBrowserApiClient({
            fetch: () => Promise.resolve(csvResponse({ 'Content-Disposition': disposition })),
        })
        expect((await downloadBatchVerification(api, id)).filename).toBe(expected)
    })

    it.each(['application/json', 'text/html', 'application/octet-stream', ''])(
        'rejects non-CSV content type %s',
        async type => {
            const api = createBrowserApiClient({ fetch: () => Promise.resolve(csvResponse({ 'Content-Type': type })) })
            await expect(downloadBatchVerification(api, id)).rejects.toMatchObject({ status: 502 })
        },
    )

    it.each([401, 403, 404, 503])(
        'normalizes download HTTP %s and does not treat it as a CSV Blob',
        async responseStatus => {
            const response = Response.json({ message: 'private storage path' }, { status: responseStatus })
            const blob = vi.spyOn(response, 'blob')
            const api = createBrowserApiClient({ fetch: () => Promise.resolve(response) })
            const error = await downloadBatchVerification(api, id).catch((value: unknown) => value)
            expect(error).toMatchObject({ status: responseStatus })
            expect(String(error)).not.toContain('private')
            expect(blob).not.toHaveBeenCalled()
        },
    )

    it('rejects a download that finishes parsing after the authentication boundary changed', async () => {
        let complete: ((blob: Blob) => void) | undefined
        const response = csvResponse()
        vi.spyOn(response, 'blob').mockImplementation(
            () =>
                new Promise(resolve => {
                    complete = resolve
                }),
        )
        let current = true
        const api = createBrowserApiClient({
            fetch: () => Promise.resolve(response),
            authenticationBoundary: () => ({
                signal: new AbortController().signal,
                assertCurrent: () => {
                    if (!current) throw new StaleAuthResponseError()
                },
            }),
        })
        const pending = downloadBatchVerification(api, id)
        await vi.waitFor(() => expect(complete).toBeDefined())
        current = false
        complete!(new Blob(['synthetic CSV'], { type: 'text/csv' }))
        await expect(pending).rejects.toBeInstanceOf(StaleAuthResponseError)
    })
})
