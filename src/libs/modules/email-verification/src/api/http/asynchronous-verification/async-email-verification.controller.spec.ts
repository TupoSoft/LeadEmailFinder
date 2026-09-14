import type { Request, Response } from 'express'
import { HttpStatus, NotFoundException } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { GetAsyncVerificationStatusResponseDto } from './async-email-verification.dto'
import { AsyncEmailVerificationService, VerifyAsyncOutcome } from '../../../application/delivery/async/async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from '../../../application/delivery/async/job-not-found.exception'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { VerificationRateLimitGuard } from '../verification-rate-limit.guard'
import { AsyncEmailVerificationController } from './async-email-verification.controller'

function buildRequest(rawHeaders: readonly string[] = ['host', 'example.test']): Request {
    return { rawHeaders } as unknown as Request
}

function buildResponse(): jest.Mocked<Pick<Response, 'setHeader'>> {
    return { setHeader: jest.fn() }
}

describe('AsyncEmailVerificationController', () => {
    it('runs every route through the permissions guard', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AsyncEmailVerificationController)).toEqual([PermissionsGuard])
    })

    it('requires verification:run and the rate limit guard for POST /verifyAsync', () => {
        const handler = AsyncEmailVerificationController.prototype.verifyAsync
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler)).toEqual(['verification:run'])
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([VerificationRateLimitGuard])
    })

    it('requires verification:read for GET /verifyAsync/:id', () => {
        const handler = AsyncEmailVerificationController.prototype.getAsyncVerificationState
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler)).toEqual(['verification:read'])
    })

    describe('verifyAsync', () => {
        const principal = { organizationId: 'organization-id', credentialId: 'credential-id' } as AuthPrincipal

        function buildController(
            outcome: VerifyAsyncOutcome,
        ): { controller: AsyncEmailVerificationController; service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> } {
            const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
                verifyAsync: jest.fn().mockResolvedValue(outcome),
                getAsyncVerificationState: jest.fn(),
            }
            return { controller: new AsyncEmailVerificationController(service), service }
        }

        it('admits without an Idempotency-Key header and returns the accepted ID', async () => {
            const { controller, service } = buildController({ kind: 'accepted', id: 'operation-id' })
            const response = buildResponse()

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(),
                    response as unknown as Response,
                ),
            ).resolves.toEqual({ id: 'operation-id' })
            expect(service.verifyAsync).toHaveBeenCalledWith({
                email: 'sentinel@private.example',
                organizationId: 'organization-id',
                clientRequestKey: undefined,
            })
        })

        it('forwards a canonical lowercase UUIDv7 Idempotency-Key as the client request key', async () => {
            const timestampHex = Date.now().toString(16).padStart(12, '0')
            const key = `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
            const { controller, service } = buildController({ kind: 'accepted', id: 'operation-id' })

            await controller.verifyAsync(
                { email: 'sentinel@private.example' },
                principal,
                buildRequest(['Idempotency-Key', key]),
                buildResponse() as unknown as Response,
            )
            expect(service.verifyAsync).toHaveBeenCalledWith(
                expect.objectContaining({ clientRequestKey: key }),
            )
        })

        it('rejects a malformed Idempotency-Key with 400 before calling the service', async () => {
            const { controller, service } = buildController({ kind: 'accepted', id: 'operation-id' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(['Idempotency-Key', 'not-a-uuid']),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST, message: 'invalid_idempotency_key' })
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('rejects a too-far-ahead Idempotency-Key with 400', async () => {
            const farFutureKey = (() => {
                const timestampMs = Date.now() + 60 * 60 * 1000
                const timestampHex = timestampMs.toString(16).padStart(12, '0')
                return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
            })()
            const { controller, service } = buildController({ kind: 'accepted', id: 'operation-id' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(['Idempotency-Key', farFutureKey]),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST, message: 'idempotency_key_too_far_ahead' })
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('rejects an expired Idempotency-Key with 410 before calling the service', async () => {
            const expiredKey = (() => {
                const timestampMs = Date.now() - 25 * 60 * 60 * 1000
                const timestampHex = timestampMs.toString(16).padStart(12, '0')
                return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
            })()
            const { controller, service } = buildController({ kind: 'accepted', id: 'operation-id' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(['Idempotency-Key', expiredKey]),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.GONE, message: 'idempotency_key_expired' })
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('maps insufficient-funds to 402', async () => {
            const { controller } = buildController({ kind: 'insufficient-funds', id: 'operation-id' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED, message: 'insufficient_credits' })
        })

        it('maps a key-mismatch conflict to 409', async () => {
            const { controller } = buildController({ kind: 'conflict', reason: 'key-mismatch' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.CONFLICT, message: 'idempotency_key_conflict' })
        })

        it('maps a key-expired conflict to 410', async () => {
            const { controller } = buildController({ kind: 'conflict', reason: 'key-expired' })

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(),
                    buildResponse() as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.GONE, message: 'idempotency_key_expired' })
        })

        it('maps address-cooldown to 429 with an integer Retry-After header', async () => {
            const { controller } = buildController({ kind: 'address-cooldown', retryAfterMs: 45_500 })
            const response = buildResponse()

            await expect(
                controller.verifyAsync(
                    { email: 'sentinel@private.example' },
                    principal,
                    buildRequest(),
                    response as unknown as Response,
                ),
            ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS, message: 'verification_cooldown' })
            expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '46')
        })
    })

    describe('getAsyncVerificationState', () => {
        it('delegates to the service with the route ID and the caller organization', async () => {
            const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
                verifyAsync: jest.fn(),
                getAsyncVerificationState: jest.fn().mockResolvedValue({ state: 'queued' }),
            }
            const controller = new AsyncEmailVerificationController(service)
            const principal = { organizationId: 'organization-id' } as AuthPrincipal

            await expect(
                controller.getAsyncVerificationState({ id: 'operation-id' }, principal),
            ).resolves.toEqual({ state: 'queued' })
            expect(service.getAsyncVerificationState).toHaveBeenCalledWith('operation-id', 'organization-id')
        })

        it('translates a not-found operation into a 404 NotFoundException', async () => {
            const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
                verifyAsync: jest.fn(),
                getAsyncVerificationState: jest
                    .fn()
                    .mockRejectedValue(new AsyncEmailVerificationJobNotFoundException('operation-id')),
            }
            const controller = new AsyncEmailVerificationController(service)
            const principal = { organizationId: 'organization-id' } as AuthPrincipal

            await expect(controller.getAsyncVerificationState({ id: 'operation-id' }, principal)).rejects.toBeInstanceOf(
                NotFoundException,
            )
        })

        it('lets any other error propagate unchanged', async () => {
            const failure = new Error('unexpected')
            const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
                verifyAsync: jest.fn(),
                getAsyncVerificationState: jest.fn().mockRejectedValue(failure),
            }
            const controller = new AsyncEmailVerificationController(service)
            const principal = { organizationId: 'organization-id' } as AuthPrincipal

            await expect(controller.getAsyncVerificationState({ id: 'operation-id' }, principal)).rejects.toBe(failure)
        })
    })

    it('serializes the completed verification ID with its existing nested result fields', () => {
        const dto = plainToInstance(
            GetAsyncVerificationStatusResponseDto,
            {
                state: 'completed',
                result: {
                    id: '75a98d6d-a18d-40d9-854c-9f732d2e7956',
                    email: 'sentinel@private.example',
                    reason: 'accepted_email',
                    organizationId: 'private-organization',
                    internalDiagnostic: 'private diagnostic',
                },
            },
            { strategy: 'excludeAll' },
        )

        const result = instanceToPlain(dto, { strategy: 'excludeAll', exposeUnsetFields: false })

        expect(result).toEqual({
            state: 'completed',
            result: {
                id: '75a98d6d-a18d-40d9-854c-9f732d2e7956',
                email: 'sentinel@private.example',
                reason: 'accepted_email',
            },
        })
    })
})
