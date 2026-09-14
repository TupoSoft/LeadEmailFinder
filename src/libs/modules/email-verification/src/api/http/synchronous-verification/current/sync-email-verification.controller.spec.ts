import type { Request, Response } from 'express'
import { HttpStatus } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { VerificationRateLimitGuard } from '../../verification-rate-limit.guard'
import {
    RunSynchronousVerification,
    SynchronousVerificationOutcome,
} from '../../../../application/delivery/synchronous/run-synchronous-verification'
import { SyncEmailVerificationController } from './sync-email-verification.controller'

function buildRequest(rawHeaders: readonly string[] = ['host', 'example.test']): Request {
    return { rawHeaders } as unknown as Request
}

function buildResponse(): jest.Mocked<Pick<Response, 'status' | 'setHeader'>> {
    return { status: jest.fn(), setHeader: jest.fn() }
}

function buildController(
    outcome: SynchronousVerificationOutcome,
): { controller: SyncEmailVerificationController; synchronousVerification: jest.Mocked<Pick<RunSynchronousVerification, 'execute'>> } {
    const synchronousVerification: jest.Mocked<Pick<RunSynchronousVerification, 'execute'>> = {
        execute: jest.fn().mockResolvedValue(outcome),
    }
    return { controller: new SyncEmailVerificationController(synchronousVerification), synchronousVerification }
}

describe('SyncEmailVerificationController', () => {
    const principal = { organizationId: 'organization-1' } as AuthPrincipal

    it('runs every route through the permissions guard', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, SyncEmailVerificationController)).toEqual([PermissionsGuard])
    })

    it('requires verification:run and the rate limit guard for POST /verify', () => {
        const handler = SyncEmailVerificationController.prototype.verifyEmail
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler)).toEqual(['verification:run'])
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([VerificationRateLimitGuard])
    })

    it('admits without an Idempotency-Key header and returns 201 with the completed result', async () => {
        const { controller, synchronousVerification } = buildController({
            kind: 'completed',
            result: { id: 'result-1', email: 'person@example.test' } as never,
            operation: { id: 'request-1', source: 'fresh', observedAt: null, cacheExpiresAt: null, billing: { state: 'settled', reserved: 1, charged: 1 } },
        })
        const response = buildResponse()

        const body = await controller.verifyEmail(
            { email: 'person@example.test' },
            principal,
            buildRequest(),
            response as unknown as Response,
        )

        expect(synchronousVerification.execute).toHaveBeenCalledWith({
            organizationId: 'organization-1',
            email: 'person@example.test',
            clientRequestKey: undefined,
        })
        expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED)
        expect(body).toMatchObject({ id: 'result-1', operation: { id: 'request-1' } })
    })

    it('forwards a canonical lowercase UUIDv7 Idempotency-Key as the client request key', async () => {
        const timestampHex = Date.now().toString(16).padStart(12, '0')
        const key = `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
        const { controller, synchronousVerification } = buildController({ kind: 'accepted', id: 'request-1' })

        await controller.verifyEmail(
            { email: 'person@example.test' },
            principal,
            buildRequest(['Idempotency-Key', key]),
            buildResponse() as unknown as Response,
        )

        expect(synchronousVerification.execute).toHaveBeenCalledWith(
            expect.objectContaining({ clientRequestKey: key }),
        )
    })

    it('rejects a malformed Idempotency-Key with 400 before calling the driver', async () => {
        const { controller, synchronousVerification } = buildController({ kind: 'accepted', id: 'request-1' })

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(['Idempotency-Key', 'not-a-uuid']),
                buildResponse() as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST, message: 'invalid_idempotency_key' })
        expect(synchronousVerification.execute).not.toHaveBeenCalled()
    })

    it('rejects an expired Idempotency-Key with 410 before calling the driver', async () => {
        const expiredKey = (() => {
            const timestampMs = Date.now() - 25 * 60 * 60 * 1000
            const timestampHex = timestampMs.toString(16).padStart(12, '0')
            return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
        })()
        const { controller, synchronousVerification } = buildController({ kind: 'accepted', id: 'request-1' })

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(['Idempotency-Key', expiredKey]),
                buildResponse() as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.GONE, message: 'idempotency_key_expired' })
        expect(synchronousVerification.execute).not.toHaveBeenCalled()
    })

    it('returns 202 with a Location header when the budget is exhausted', async () => {
        const { controller } = buildController({ kind: 'accepted', id: 'request-1' })
        const response = buildResponse()

        const body = await controller.verifyEmail(
            { email: 'person@example.test' },
            principal,
            buildRequest(),
            response as unknown as Response,
        )

        expect(response.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED)
        expect(response.setHeader).toHaveBeenCalledWith('Location', '/verifyAsync/request-1')
        expect(body).toEqual({ id: 'request-1' })
    })

    it('returns 202 with a Location header for a canceled execution settled with no result', async () => {
        const { controller } = buildController({
            kind: 'failed',
            operation: { id: 'request-1', source: 'fresh', observedAt: null, cacheExpiresAt: null, billing: { state: 'settled', reserved: 1, charged: 0, reason: 'failed' } },
        })
        const response = buildResponse()

        const body = await controller.verifyEmail(
            { email: 'person@example.test' },
            principal,
            buildRequest(),
            response as unknown as Response,
        )

        expect(response.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED)
        expect(response.setHeader).toHaveBeenCalledWith('Location', '/verifyAsync/request-1')
        expect(body).toEqual({ id: 'request-1' })
    })

    it('maps insufficient-funds to 402', async () => {
        const { controller } = buildController({ kind: 'insufficient-funds' })

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(),
                buildResponse() as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED, message: 'insufficient_credits' })
    })

    it('maps a key-mismatch conflict to 409', async () => {
        const { controller } = buildController({ kind: 'conflict', reason: 'key-mismatch' })

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(),
                buildResponse() as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.CONFLICT, message: 'idempotency_key_conflict' })
    })

    it('maps a key-expired conflict to 410', async () => {
        const { controller } = buildController({ kind: 'conflict', reason: 'key-expired' })

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(),
                buildResponse() as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.GONE, message: 'idempotency_key_expired' })
    })

    it('maps address-cooldown to 429 with an integer Retry-After header', async () => {
        const { controller } = buildController({ kind: 'address-cooldown', retryAfterMs: 12_500 })
        const response = buildResponse()

        await expect(
            controller.verifyEmail(
                { email: 'person@example.test' },
                principal,
                buildRequest(),
                response as unknown as Response,
            ),
        ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS, message: 'verification_cooldown' })
        expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '13')
    })
})
