import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { SyncEmailVerificationController } from './sync-email-verification.controller'
import { RunSynchronousVerification } from '../../../../application/delivery/synchronous/run-synchronous-verification'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

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

    it('passes only the authenticated organization and request email to verification', async () => {
        const synchronousVerification: jest.Mocked<Pick<RunSynchronousVerification, 'execute'>> = {
            execute: jest.fn().mockResolvedValue({ email: 'person@example.test' }),
        }
        const controller = new SyncEmailVerificationController(synchronousVerification)
        const principal = { organizationId: 'organization-1' } as AuthPrincipal

        await controller.verifyEmail({ email: 'person@example.test' }, principal)

        expect(synchronousVerification.execute).toHaveBeenCalledWith({
            organizationId: 'organization-1',
            email: 'person@example.test',
        })
    })
})
