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
})
