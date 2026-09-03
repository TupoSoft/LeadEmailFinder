import { Controller, Get, INestApplication, Param, Patch } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import type { DestinationStream } from 'pino'
import { Logger, LoggerModule } from 'pino-nestjs'
import request from 'supertest'
import { createPiiSafePinoHttpOptions } from './pii-safe-logger-options'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const capturedLines: Record<string, unknown>[] = []
const destination: DestinationStream = {
    write(message: string): void {
        capturedLines.push(JSON.parse(message) as Record<string, unknown>)
    },
}

@Controller()
class PiiSafeRequestLoggingTestController {
    @Get('verify')
    verify(): { ok: true } {
        return { ok: true }
    }

    @Patch('emails/:email')
    reject(@Param('email') email: string): never {
        throw new Error('Request rejected for ' + email)
    }
}

describe('PII-safe request logging', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [
                LoggerModule.forRoot({
                    pinoHttp: [createPiiSafePinoHttpOptions(), destination],
                }),
            ],
            controllers: [PiiSafeRequestLoggingTestController],
        }).compile()

        app = moduleRef.createNestApplication()
        app.useLogger(app.get(Logger))
        await app.init()
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

        await request(app.getHttpServer())
            .get('/verify?email=' + encodedSentinel)
            .set('Authorization', authorization)
            .set('Cookie', cookie)
            .set('User-Agent', userAgent)
            .set('X-Forwarded-For', forwardedAddress)
            .set('X-Request-ID', attackerRequestId)
            .expect(200)

        await request(app.getHttpServer())
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
                    req: expect.objectContaining({ method: 'GET', path: '/verify' }),
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
})
