import { Request } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { GetAsyncVerificationStatusResponseDto } from './async-email-verification.dto'
import { AsyncEmailVerificationService } from '../../../application/delivery/async/async-email-verification.service'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { AsyncEmailVerificationController } from './async-email-verification.controller'

describe('AsyncEmailVerificationController', () => {
    it('runs every route through the permissions guard', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AsyncEmailVerificationController)).toEqual([PermissionsGuard])
    })

    it('requires verification:run for POST /verifyAsync and still deducts a credit after authorization passes', () => {
        const handler = AsyncEmailVerificationController.prototype.verifyAsync
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler)).toEqual(['verification:run'])
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([CreditGuard])
    })

    it('requires verification:read for GET /verifyAsync/:id', () => {
        const handler = AsyncEmailVerificationController.prototype.getAsyncVerificationState
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler)).toEqual(['verification:read'])
    })
    it('passes the generated request ID to dispatch while preserving the submission body', async () => {
        const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
            verifyAsync: jest.fn().mockResolvedValue({ id: 'job-id' }),
            getAsyncVerificationState: jest.fn(),
        }
        const principal = { organizationId: 'organization-id', credentialId: 'credential-id' } as AuthPrincipal
        const controller = new AsyncEmailVerificationController(service)
        const request = {
            id: 'server-generated-id',
            headers: { 'x-request-id': 'attacker-controlled-id' },
        } as unknown as Request

        await expect(
            controller.verifyAsync({ email: 'sentinel@private.example' }, principal, request),
        ).resolves.toEqual({ id: 'job-id' })
        expect(service.verifyAsync).toHaveBeenCalledWith({
            email: 'sentinel@private.example',
            organizationId: 'organization-id',
            credentialId: 'credential-id',
            requestId: 'server-generated-id',
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
