import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'

describe('OldSyncEmailVerificationController', () => {
    it('requires verification:read for the deprecated GET /verify route', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, OldSyncEmailVerificationController)).toEqual([PermissionsGuard])
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, OldSyncEmailVerificationController)).toEqual([
            'verification:read',
        ])
    })
})
