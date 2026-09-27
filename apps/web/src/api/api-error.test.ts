import { describe, expect, it, vi } from 'vitest'
import { normalizeApiError } from './api-error'

describe('safe API error metadata', () => {
    it('preserves only the public request-clock rejection code from a 400 response', async () => {
        const error = await normalizeApiError(
            Response.json(
                {
                    statusCode: 400,
                    message: 'idempotency_key_too_far_ahead',
                    error: 'Bad Request',
                    details: 'private-provider-details',
                },
                { status: 400 },
            ),
            false,
        )
        expect(error.code).toBe('idempotency_key_too_far_ahead')
        expect(error.category).toBe('request-failed')
        expect(JSON.stringify(error)).not.toContain('private-provider-details')
        expect(error.message).not.toContain('idempotency_key_too_far_ahead')
    })

    it.each([
        [400, { message: 'private-provider-message' }],
        [400, { message: ['idempotency_key_too_far_ahead'] }],
        [400, { code: 'idempotency_key_too_far_ahead' }],
        [500, { message: 'idempotency_key_too_far_ahead' }],
    ])('does not expose unrecognized error metadata for status %s', async (status, body) => {
        const error = await normalizeApiError(Response.json(body, { status }), false)
        expect(error.code).toBeUndefined()
        expect(JSON.stringify(error)).not.toContain('private-provider-message')
    })

    it('retains the server retry deadline without retaining its error body', async () => {
        const now = Date.parse('2026-09-16T12:00:00.000Z')
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
        try {
            for (const [header, deadline] of [
                ['30', now + 30_000],
                ['Wed, 16 Sep 2026 12:01:00 GMT', now + 60_000],
            ] as const) {
                const error = await normalizeApiError(
                    Response.json(
                        { message: 'private-address' },
                        {
                            status: 429,
                            headers: { 'Retry-After': header },
                        },
                    ),
                    false,
                )
                expect(error.retryAt).toBe(deadline)
                expect(JSON.stringify(error)).not.toContain('private-address')
            }
        } finally {
            clock.mockRestore()
        }
    })

    it.each(['-1', 'tomorrow', '2026', 'Infinity', '9'.repeat(400)])(
        'discards an unsafe retry header %s',
        async header => {
            const status = header === '2026' ? 500 : 429
            const error = await normalizeApiError(
                new Response(null, { status, headers: { 'Retry-After': header } }),
                false,
            )
            expect(error.retryAt).toBeUndefined()
        },
    )

    it('retains status and safe correlation identifiers while excluding response text', async () => {
        const error = await normalizeApiError(
            Response.json(
                { message: 'private-provider-token' },
                {
                    status: 503,
                    headers: { 'x-request-id': 'request_123-safe' },
                },
            ),
            false,
        )
        expect(error).toMatchObject({ status: 503, correlationId: 'request_123-safe', category: 'request-failed' })
        expect(error.message).not.toContain('private-provider-token')
        expect(JSON.stringify(error)).not.toContain('private-provider-token')
    })

    it('drops malformed correlation identifiers and tolerates a non-JSON error body', async () => {
        const error = await normalizeApiError(
            new Response('private provider HTML', {
                status: 403,
                headers: { 'x-request-id': '<script>private</script>' },
            }),
            true,
        )
        expect(error).toMatchObject({ status: 403, category: 'access-denied' })
        expect(error.correlationId).toBeUndefined()
    })
})
