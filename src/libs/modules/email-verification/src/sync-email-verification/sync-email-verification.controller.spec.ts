import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { SyncEmailVerificationController } from './sync-email-verification.controller'

describe('SyncEmailVerificationController', () => {
    it('requires verification:run for POST /verify', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, SyncEmailVerificationController)).toEqual([PermissionsGuard])
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, SyncEmailVerificationController)).toEqual([
            'verification:run',
        ])
    })

    it('still deducts a credit for every verification after authorization passes', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, SyncEmailVerificationController.prototype.verifyEmail)).toEqual([
            CreditGuard,
        ])
    })
})
