import {
    CanActivate,
    Controller,
    ForbiddenException,
    Get,
    INestApplication,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    RawBodyRequest,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import type { DestinationStream } from 'pino'
import { Logger, LoggerModule } from 'pino-nestjs'
import request from 'supertest'
import { createPiiSafePinoHttpOptions } from './pii-safe-logger-options'
import { configurePiiSafeRequestLogging } from './configure-pii-safe-request-logging'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const capturedLines: Record<string, unknown>[] = []
const destination: DestinationStream = {
    write(message: string): void {
        capturedLines.push(JSON.parse(message) as Record<string, unknown>)
    },
}

class UnauthenticatedTestGuard implements CanActivate {
    canActivate(): never {
        throw new UnauthorizedException()
    }
}

class ForbiddenTestGuard implements CanActivate {
    canActivate(): never {
        throw new ForbiddenException()
    }
}

@Controller()
class PiiSafeRequestLoggingTestController {
    constructor(private readonly logger: Logger) {}

    @Get('query-logging')
    queryLogging(@Req() incoming: IncomingMessage): { ok: true; requestId: IncomingMessage['id'] } {
        this.logger.log('query_logging_test_handler')
        return { ok: true, requestId: incoming.id }
    }

    @Get('validation/:id')
    validate(@Param('id', new ParseUUIDPipe()) id: string): { id: string } {
        return { id }
    }

    @Get('unauthenticated')
    @UseGuards(UnauthenticatedTestGuard)
    unauthenticated(): void {}

    @Get('forbidden')
    @UseGuards(ForbiddenTestGuard)
    forbidden(): void {}

    @Get('unexpected')
    unexpected(): never {
        throw new Error('Private provider response')
    }

    @Post('raw-body')
    rawBody(@Req() incoming: RawBodyRequest<Request>): { body: unknown; rawBody: string | undefined } {
        return { body: incoming.body as unknown, rawBody: incoming.rawBody?.toString('utf8') }
    }

    @Patch('emails/:email')
    reject(@Param('email') email: string): never {
        throw new Error('Request rejected for ' + email)
    }
}

describe('PII-safe request logging', () => {
    let app: INestApplication
    let preexistingRequestId: string | undefined

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [
                LoggerModule.forRoot({
                    useExisting: true,
                    pinoHttp: [createPiiSafePinoHttpOptions(), destination],
                }),
            ],
            controllers: [PiiSafeRequestLoggingTestController],
        }).compile()

        app = moduleRef.createNestApplication({ rawBody: true })
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            if (preexistingRequestId) {
                incoming.id = preexistingRequestId
            }
            next()
        })
        configurePiiSafeRequestLogging(app, destination)
        app.getHttpAdapter().get('/early-route', (_incoming: Request, response: Response) => {
            response.json({ ok: true })
        })
        app.useLogger(app.get(Logger))
        await app.init()
    })

    beforeEach(() => {
        capturedLines.length = 0
        preexistingRequestId = undefined
    })

    afterAll(async () => {
        await app.close()
    })

    it('captures useful request metadata without any supplied sensitive values', async () => {
        const sentinel = 'sentinel-' + randomUUID() + '@example.test'
        const encodedSentinel = encodeURIComponent(sentinel)
        const bodySecret = 'body-secret-' + randomUUID()
        const authorization = 'Bearer auth-secret-' + randomUUID()
        const cookie = 'session=cookie-secret-' + randomUUID()
        const userAgent = 'sensitive-agent-' + randomUUID()
        const forwardedAddress = '198.51.100.77'
        const attackerRequestId = 'attacker-request-' + randomUUID()

        const success = await request(app.getHttpServer())
            .get('/query-logging?email=' + encodedSentinel)
            .set('Authorization', authorization)
            .set('Cookie', cookie)
            .set('User-Agent', userAgent)
            .set('X-Forwarded-For', forwardedAddress)
            .set('X-Request-ID', attackerRequestId)
            .expect(200)

        const failure = await request(app.getHttpServer())
            .patch('/emails/' + encodedSentinel)
            .set('Authorization', authorization)
            .set('Cookie', cookie)
            .set('User-Agent', userAgent)
            .set('X-Forwarded-For', forwardedAddress)
            .set('X-Request-ID', attackerRequestId)
            .send({ email: sentinel, privateValue: bodySecret })
            .expect(500)

        await new Promise<void>(resolve => setImmediate(resolve))

        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(2)
        expect(automaticLogs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    req: expect.objectContaining({ method: 'GET', path: '/query-logging' }),
                    res: { statusCode: 200 },
                    responseTime: expect.any(Number),
                }),
                expect.objectContaining({
                    req: expect.objectContaining({ method: 'PATCH', path: '/emails/:sensitive' }),
                    res: { statusCode: 500 },
                    responseTime: expect.any(Number),
                }),
            ]),
        )

        const requestIds: string[] = []
        for (const log of automaticLogs) {
            const requestLog = log.req as Record<string, unknown>
            const responseLog = log.res as Record<string, unknown>
            expect(Object.keys(requestLog).sort()).toEqual(['id', 'method', 'path'])
            expect(Object.keys(responseLog)).toEqual(['statusCode'])
            expect(requestLog.id).toEqual(expect.stringMatching(UUID_PATTERN))
            requestIds.push(requestLog.id as string)
        }
        expect(new Set(requestIds).size).toBe(2)
        expect(requestIds).not.toContain(attackerRequestId)
        expect(success.headers['x-request-id']).toBe(requestIds[0])
        expect((success.body as { requestId: string }).requestId).toBe(requestIds[0])
        expect(failure.headers['x-request-id']).toBe(requestIds[1])

        for (const log of capturedLines.filter(line => typeof line.req === 'object' && line.req !== null)) {
            expect(Object.keys(log.req as Record<string, unknown>).sort()).toEqual(['id', 'method', 'path'])
        }

        const completeOutput = capturedLines.map(line => JSON.stringify(line)).join('\n')
        expect(completeOutput).not.toContain(sentinel)
        expect(completeOutput.toLowerCase()).not.toContain(encodedSentinel.toLowerCase())
        expect(completeOutput).not.toContain(bodySecret)
        expect(completeOutput).not.toContain(authorization)
        expect(completeOutput).not.toContain(cookie)
        expect(completeOutput).not.toContain(userAgent)
        expect(completeOutput).not.toContain(forwardedAddress)
        expect(completeOutput).not.toContain(attackerRequestId)
        expect(completeOutput).not.toContain('127.0.0.1')
    })

    it.each([
        ['/query-logging', 200],
        ['/validation/not-a-uuid', 400],
        ['/unauthenticated', 401],
        ['/forbidden', 403],
        ['/missing', 404],
        ['/unexpected', 500],
        ['/early-route', 200],
    ])('returns a server UUID matching the log for %s (%i) despite a preexisting ID', async (path, status) => {
        preexistingRequestId = 'middleware-secret-' + randomUUID()
        const attackerHeader = 'header-secret-' + randomUUID()

        const response = await request(app.getHttpServer())
            .get(path)
            .set('X-Request-ID', attackerHeader)
            .expect(status)
        await new Promise<void>(resolve => setImmediate(resolve))

        const responseId: unknown = response.headers['x-request-id']
        expect(responseId).toEqual(expect.stringMatching(UUID_PATTERN))
        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(automaticLogs[0]).toEqual(expect.objectContaining({
            req: { id: responseId, method: 'GET', path },
            res: { statusCode: status },
        }))
        if (path === '/query-logging') {
            expect((response.body as { requestId: string }).requestId).toBe(responseId)
            expect(capturedLines.find(line => line.msg === 'query_logging_test_handler')).toEqual(
                expect.objectContaining({ req: { id: responseId, method: 'GET', path } }),
            )
        }

        const completeOutput = JSON.stringify(capturedLines)
        expect(completeOutput).not.toContain(preexistingRequestId)
        expect(completeOutput).not.toContain(attackerHeader)
        expect(completeOutput).not.toContain('Private provider response')
    })

    it('keeps a server UUID and conceals the retired GET verification query on its 404 response', async () => {
        const sentinel = 'retired-verification-' + randomUUID() + '@example.test'
        const encodedSentinel = encodeURIComponent(sentinel)
        const attackerRequestId = 'attacker-request-' + randomUUID()
        preexistingRequestId = 'middleware-request-' + randomUUID()

        const response = await request(app.getHttpServer())
            .get('/verify?email=' + encodedSentinel)
            .set('X-Request-ID', attackerRequestId)
            .expect(404)
        await new Promise<void>(resolve => setImmediate(resolve))

        const responseId: unknown = response.headers['x-request-id']
        expect(responseId).toEqual(expect.stringMatching(UUID_PATTERN))
        expect(responseId).not.toBe(attackerRequestId)
        expect(responseId).not.toBe(preexistingRequestId)
        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(automaticLogs[0]).toEqual(expect.objectContaining({
            req: { id: responseId, method: 'GET', path: '/verify' },
            res: { statusCode: 404 },
        }))

        const completeOutput = JSON.stringify(capturedLines)
        expect(completeOutput).not.toContain(sentinel)
        expect(completeOutput.toLowerCase()).not.toContain(encodedSentinel.toLowerCase())
        expect(completeOutput).not.toContain(attackerRequestId)
        expect(completeOutput).not.toContain(preexistingRequestId)
    })

    it('returns a request UUID when JSON parsing rejects the body', async () => {
        const response = await request(app.getHttpServer())
            .patch('/emails/invalid')
            .set('Content-Type', 'application/json')
            .send('{')
            .expect(400)

        expect(response.headers['x-request-id']).toEqual(expect.stringMatching(UUID_PATTERN))
        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(automaticLogs[0]).toEqual(expect.objectContaining({
            req: { id: response.headers['x-request-id'], method: 'PATCH', path: '/emails/:sensitive' },
            res: { statusCode: 400 },
        }))
    })

    it('preserves the exact raw body used to validate webhook signatures', async () => {
        const rawBody = '{ "privatePayload": "synthetic-webhook-sentinel" }'
        const response = await request(app.getHttpServer())
            .post('/raw-body')
            .set('Content-Type', 'application/json')
            .send(rawBody)
            .expect(201)

        expect(response.body).toEqual({ body: JSON.parse(rawBody) as unknown, rawBody })
        expect(response.headers['x-request-id']).toEqual(expect.stringMatching(UUID_PATTERN))
        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(JSON.stringify(capturedLines)).not.toContain('synthetic-webhook-sentinel')
    })

    it.each([
        ['/verifications/', '', 'private-domain.test'],
        ['/verifyAsync/', '', 'provider-credential-secret'],
        ['/verifyBatch/', '/results', 'private-batch-domain.test'],
    ])('conceals non-UUID values on %s result routes', async (prefix, suffix, privateValue) => {
        const response = await request(app.getHttpServer())
            .get(prefix + privateValue + suffix)
            .expect(404)

        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(automaticLogs[0]).toEqual(expect.objectContaining({
            req: { id: response.headers['x-request-id'], method: 'GET', path: prefix + ':sensitive' + suffix },
        }))
        expect(JSON.stringify(capturedLines)).not.toContain(privateValue)
    })

    it.each(['/v1/organizations/invitations/', '/accept-invitation/'])(
        'conceals invitation credentials on %s routes, including rejected requests',
        async prefix => {
            const token = 'invitation-token-' + randomUUID()
            const code = 'callback-code-' + randomUUID()
            const state = 'callback-state-' + randomUUID()
            const response = await request(app.getHttpServer())
                .get(prefix + token + '?code=' + code + '&state=' + state)
                .expect(404)

            const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
            expect(automaticLogs).toHaveLength(1)
            expect(automaticLogs[0]).toEqual(expect.objectContaining({
                req: {
                    id: response.headers['x-request-id'],
                    method: 'GET',
                    path: prefix + ':sensitive',
                },
                res: { statusCode: 404 },
            }))
            expect(response.headers['x-request-id']).toEqual(expect.stringMatching(UUID_PATTERN))
            const output = JSON.stringify(capturedLines)
            for (const marker of [token, code, state]) expect(output).not.toContain(marker)
        },
    )

    it('conceals acceptance tokens, passwords, and referrers on rejected submissions', async () => {
        const token = randomUUID()
        const password = randomUUID()
        await request(app.getHttpServer())
            .post(`/v1/organizations/invitations/${token}/accept`)
            .set('Referer', `http://browser/accept-invitation/${token}`)
            .send({ password })
            .expect(404)

        const output = JSON.stringify(capturedLines)
        for (const marker of [token, password]) expect(output.includes(marker)).toBe(false)
        expect(capturedLines.some(line =>
            (line.req as { path?: string } | undefined)?.path === '/v1/organizations/invitations/:sensitive/accept',
        )).toBe(true)
    })

    it.each([
        ['/v1/organizations/invitations%2F', '/v1/organizations/:sensitive'],
        ['/v1/organizations%252Finvitations/', '/v1/organizations%252Finvitations/:sensitive'],
        ['/accept-invitation%252F', '/:sensitive'],
        ['/emails%2F', '/:sensitive'],
        ['/emails%252F', '/:sensitive'],
        ['/api%252Femails/', '/api%252Femails/:sensitive'],
        ['/verifications%2F', '/:sensitive'],
        ['/verifyAsync%252F', '/:sensitive'],
        ['/verifyBatch%2F', '/:sensitive'],
        ['/api%252FverifyAsync/', '/api%252FverifyAsync/:sensitive'],
        ['/verifyAsync/3b6e879d-b4ed-4a44-b121-710f16ee92c3%2F', '/verifyAsync/:sensitive'],
        ['/api%2FverifyBatch/csv%252F', '/api%2FverifyBatch/:sensitive'],
    ])('conceals protected path values when encoded separators reach %s', async (prefix, path) => {
        const privateValue = 'encoded-sensitive-' + randomUUID()
        const response = await request(app.getHttpServer()).get(prefix + privateValue).expect(404)

        const automaticLogs = capturedLines.filter(line => typeof line.responseTime === 'number')
        expect(automaticLogs).toHaveLength(1)
        expect(automaticLogs[0]).toEqual(expect.objectContaining({
            req: { id: response.headers['x-request-id'], method: 'GET', path },
            res: { statusCode: 404 },
        }))
        expect(JSON.stringify(capturedLines)).not.toContain(privateValue)
    })
})
