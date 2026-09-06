import type { IncomingMessage, ServerResponse } from 'node:http'
import pino from 'pino'
import type { DestinationStream } from 'pino'
import { createPiiSafePinoHttpOptions, sanitizeRequestTarget } from './pii-safe-logger-options'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

interface SerializedRequestLog {
    id: string
    method: string
    path: string
}

interface SerializedErrorLog {
    type: string
}

describe('sanitizeRequestTarget', () => {
    it.each([
        ['/verify?email=sentinel@example.test#ignored', '/verify'],
        ['/emails/sentinel%40example.test', '/emails/:sensitive'],
        ['/api/emails/sentinel%2540example.test', '/api/emails/:sensitive'],
        ['/emails%2Fprivate-marker', '/:sensitive'],
        ['/emails%252Fprivate-marker', '/:sensitive'],
        ['/api%252Femails/private-marker/details', '/api%252Femails/:sensitive/details'],
        ['/emails', '/emails'],
        ['/other/sentinel@example.test/details', '/other/:sensitive/details'],
        ['/health?email=sentinel@example.test', '/health'],
        ['/v1/auth/callback?code=private-code&state=private-state', '/v1/auth/callback'],
        ['/v1/auth/login?returnTo=private', '/v1/auth/login'],
        ['/v1/auth/logout?state=private', '/v1/auth/logout'],
        ['/v1/organizations/invitations/private-token', '/v1/organizations/invitations/:sensitive'],
        ['/v1/organizations/%69nvitations/private-token/accept', '/v1/organizations/%69nvitations/:sensitive/accept'],
        ['/accept-invitation/private%252Dtoken', '/accept-invitation/:sensitive'],
        ['/v1/organizations/invitations%2Fprivate-token', '/v1/organizations/:sensitive'],
        ['/v1/organizations%252Finvitations/private-token/accept', '/v1/organizations%252Finvitations/:sensitive/accept'],
        ['/accept-invitation%252Fprivate-token', '/:sensitive'],
        ['/v1/organizations/invitations', '/v1/organizations/invitations'],
        ['/encoded/non%20sensitive', '/encoded/non%20sensitive'],
        ['/verifications/private-domain.test', '/verifications/:sensitive'],
        ['/verifyAsync/private-credential', '/verifyAsync/:sensitive'],
        ['/verifyBatch/private-domain.test/results', '/verifyBatch/:sensitive/results'],
        ['/verifications%2Fprivate-domain.test', '/:sensitive'],
        ['/verifyAsync%252Fprivate-credential', '/:sensitive'],
        ['/verifyBatch%2Fprivate-domain.test/results', '/:sensitive/results'],
        ['/api%252FverifyAsync/private-credential', '/api%252FverifyAsync/:sensitive'],
        ['/verifyBatch/csv', '/verifyBatch/csv'],
        ['/verifyBatch%2Fcsv', '/verifyBatch%2Fcsv'],
        ['/api%252FverifyBatch/csv', '/api%252FverifyBatch/csv'],
        ['/verifyBatch%2FCSV', '/:sensitive'],
        ['/verifyAsync/3b6e879d-b4ed-4a44-b121-710f16ee92c3%2Fprivate-marker', '/verifyAsync/:sensitive'],
        ['/api%2FverifyBatch/csv%252Fprivate-marker', '/api%2FverifyBatch/:sensitive'],
        ['/verifyAsync%2F3b6e879d-b4ed-4a44-b121-710f16ee92c3', '/verifyAsync%2F3b6e879d-b4ed-4a44-b121-710f16ee92c3'],
        ['/api%2Fverifications/3b6e879d-b4ed-4a44-b121-710f16ee92c3', '/api%2Fverifications/3b6e879d-b4ed-4a44-b121-710f16ee92c3'],
        ['/verifications/3b6e879d-b4ed-4a44-b121-710f16ee92c3', '/verifications/3b6e879d-b4ed-4a44-b121-710f16ee92c3'],
    ])('sanitizes %s as %s', (rawUrl, expected) => {
        expect(sanitizeRequestTarget(rawUrl)).toBe(expected)
    })

    it('returns a fixed value for a malformed encoded path', () => {
        expect(sanitizeRequestTarget('/emails/%E0%A4%A')).toBe('/invalid-request-target')
    })

    it('returns a fixed value for an absent request target', () => {
        expect(sanitizeRequestTarget('')).toBe('/invalid-request-target')
        expect(sanitizeRequestTarget('   ')).toBe('/invalid-request-target')
    })
})

describe('createPiiSafePinoHttpOptions', () => {
    it('reuses only its private server UUID for the request, response header, and serializer', () => {
        const options = createPiiSafePinoHttpOptions()
        const request = {
            id: 'caller-controlled-id',
            headers: { 'x-request-id': 'caller-controlled-header' },
        } as unknown as IncomingMessage
        const response = { setHeader: jest.fn() } as unknown as ServerResponse
        const generatedId = options.genReqId?.(request, response)

        expect(generatedId).toEqual(expect.stringMatching(UUID_PATTERN))
        expect(request.id).toBe(generatedId)
        expect(response.setHeader).toHaveBeenLastCalledWith('X-Request-ID', generatedId)

        request.id = 'replacement-caller-id'
        expect(options.genReqId?.(request, response)).toBe(generatedId)
        expect(options.serializers?.req(request)).toEqual(expect.objectContaining({ id: generatedId }))
    })

    it('sets the authoritative request ID when Pino skips genReqId for an existing request.id', () => {
        const options = createPiiSafePinoHttpOptions()
        const request = { id: 'caller-controlled-id' } as unknown as IncomingMessage
        const response = { setHeader: jest.fn() } as unknown as ServerResponse

        expect(options.customProps?.(request, response)).toEqual({})
        expect(request.id).toEqual(expect.stringMatching(UUID_PATTERN))
        expect(response.setHeader).toHaveBeenCalledWith('X-Request-ID', request.id)
        expect(options.serializers?.req(request)).toEqual(expect.objectContaining({ id: request.id }))
    })

    it('allowlists request and response fields and replaces a preexisting request ID', () => {
        const options = createPiiSafePinoHttpOptions()
        const serializers = options.serializers
        expect(serializers).toBeDefined()
        if (!serializers) {
            throw new Error('Expected Pino serializers')
        }

        const request = {
            id: 'attacker-controlled-request-id',
            method: 'PATCH',
            originalUrl: '/emails/sentinel%40example.test?token=private',
            url: '/rewritten',
            headers: { authorization: 'Bearer private' },
            body: { email: 'sentinel@example.test' },
            socket: { remoteAddress: '198.51.100.10', remotePort: 43123 },
        } as unknown as IncomingMessage & { originalUrl: string }
        const response = {
            statusCode: 418,
            getHeaders: () => ({ 'set-cookie': 'private-cookie' }),
        } as unknown as ServerResponse

        const serializedRequest = serializers.req(request) as SerializedRequestLog
        const serializedResponse = serializers.res(response) as { statusCode: number }

        expect(serializedRequest).toEqual({
            id: expect.stringMatching(UUID_PATTERN),
            method: 'PATCH',
            path: '/emails/:sensitive',
        })
        expect(request.id).toBe(serializedRequest.id)
        expect(serializedRequest.id).not.toBe('attacker-controlled-request-id')
        expect(Object.keys(serializedRequest).sort()).toEqual(['id', 'method', 'path'])
        expect(serializedResponse).toEqual({ statusCode: 418 })
        expect(Object.keys(serializedResponse)).toEqual(['statusCode'])
    })

    it('omits error messages, message-controlled fake frames, stacks, and enumerable details', () => {
        const sentinel = 'sentinel@example.test'
        const options = createPiiSafePinoHttpOptions()
        const serializer = options.serializers?.err
        expect(serializer).toBeDefined()
        if (!serializer) {
            throw new Error('Expected an error serializer')
        }

        const error = Object.assign(new Error('Failure for ' + sentinel + '\n    at ' + sentinel), {
            providerPayload: sentinel,
        })
        const serializedError = serializer(error) as SerializedErrorLog

        expect(serializedError.type).toBe('Error')
        expect(Object.keys(serializedError)).toEqual(['type'])
        expect(JSON.stringify(serializedError)).not.toContain(sentinel)
        expect(serializer({ message: sentinel, stack: sentinel })).toEqual({ type: 'UnknownError' })
    })

    it('falls back safely when an Error has a hostile constructor property', () => {
        const options = createPiiSafePinoHttpOptions()
        const serializer = options.serializers?.err
        expect(serializer).toBeDefined()
        if (!serializer) {
            throw new Error('Expected an error serializer')
        }

        const error = new Error('private message')
        Object.defineProperties(error, {
            constructor: { get: () => { throw new Error('private constructor') } },
        })

        expect(serializer(error)).toEqual({ type: 'Error' })
    })

    it('replaces top-level messages when structured or direct Error values are logged', () => {
        const sentinel = 'sentinel@example.test'
        const lines: Record<string, unknown>[] = []
        const destination: DestinationStream = {
            write(message: string): void {
                lines.push(JSON.parse(message) as Record<string, unknown>)
            },
        }
        const logger = pino(createPiiSafePinoHttpOptions(), destination)
        const error = new Error('Failure for ' + sentinel)

        logger.error({ err: error }, error.message)
        logger.error(error)

        expect(lines).toHaveLength(2)
        for (const line of lines) {
            expect(line.msg).toBe('application_error')
            expect(JSON.stringify(line)).not.toContain(sentinel)
            expect(line.err).toEqual(expect.objectContaining({ type: 'Error' }))
        }
    })
})
