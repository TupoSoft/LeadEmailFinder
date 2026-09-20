import { mapNetworkError, mapUpstreamError } from './errors.js'

const sensitiveBody = { message: 'do-not-leak-this-secret-value', internalTraceId: 'do-not-leak-this-secret-value' }

function response(status: number, headers: Record<string, string> = {}): Response {
    return new Response(null, { status, headers })
}

describe('mapUpstreamError', () => {
    it.each([
        [401, 'authentication_required'],
        [402, 'insufficient_credits'],
        [404, 'not_found'],
        [422, 'validation_failed'],
        [429, 'rate_limited'],
        [503, 'service_unavailable'],
    ] as const)('maps HTTP %d to %s', (status, expectedCode) => {
        const error = mapUpstreamError(response(status), sensitiveBody)

        expect(error.code).toBe(expectedCode)
        expect(error.message).not.toContain('do-not-leak-this-secret-value')
    })

    it('maps an unmapped 5xx status to unexpected_upstream_error', () => {
        const error = mapUpstreamError(response(500), sensitiveBody)

        expect(error.code).toBe('unexpected_upstream_error')
        expect(error.message).not.toContain('do-not-leak-this-secret-value')
    })

    it('extracts retryAfterSeconds from a 429 Retry-After header', () => {
        const error = mapUpstreamError(response(429, { 'Retry-After': '30' }), sensitiveBody)

        expect(error.retryAfterSeconds).toBe(30)
    })

    it('extracts retryAfterSeconds from a 503 Retry-After header', () => {
        const error = mapUpstreamError(response(503, { 'Retry-After': '5' }), sensitiveBody)

        expect(error.retryAfterSeconds).toBe(5)
    })

    it('omits retryAfterSeconds when no Retry-After header is present', () => {
        const error = mapUpstreamError(response(429), sensitiveBody)

        expect(error.retryAfterSeconds).toBeUndefined()
    })

    it('never extracts retryAfterSeconds for a status other than 429/503', () => {
        const error = mapUpstreamError(response(404, { 'Retry-After': '30' }), sensitiveBody)

        expect(error.retryAfterSeconds).toBeUndefined()
    })

    it('never inspects or echoes the body argument at all', () => {
        const error = mapUpstreamError(response(401), sensitiveBody)

        expect(JSON.stringify(error)).not.toContain('do-not-leak-this-secret-value')
    })
})

describe('mapNetworkError', () => {
    it('always maps to unexpected_upstream_error without inspecting the thrown error', () => {
        expect(mapNetworkError()).toEqual({
            code: 'unexpected_upstream_error',
            message: 'An unexpected error occurred while calling the upstream service.',
        })
    })
})
