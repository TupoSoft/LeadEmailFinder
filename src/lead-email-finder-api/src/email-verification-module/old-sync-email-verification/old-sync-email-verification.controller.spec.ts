import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '../../credits'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'

describe('OldSyncEmailVerificationController', () => {
    it('requires verification:run for the deprecated GET /verify route', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, OldSyncEmailVerificationController)).toEqual([PermissionsGuard])
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, OldSyncEmailVerificationController)).toEqual([
            'verification:run',
        ])
    })

    it('still deducts a credit for every deprecated verification after authorization passes', () => {
        expect(
            Reflect.getMetadata(GUARDS_METADATA, OldSyncEmailVerificationController.prototype.verifyEmail),
        ).toEqual([CreditGuard])
    })
})
