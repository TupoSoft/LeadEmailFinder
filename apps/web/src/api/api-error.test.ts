import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './api-error'

describe('safe API error metadata', () => {
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
