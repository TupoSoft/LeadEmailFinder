import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { SyncEmailVerificationController } from './sync-email-verification.controller'
import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
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
        const emailVerificationService: jest.Mocked<Pick<IEmailVerificationService, 'verify'>> = {
            verify: jest.fn().mockResolvedValue({ email: 'person@example.test' }),
        }
        const controller = new SyncEmailVerificationController(emailVerificationService as IEmailVerificationService)
        const principal = { organizationId: 'organization-1' } as AuthPrincipal

        await controller.verifyEmail({ email: 'person@example.test' }, principal)

        expect(emailVerificationService.verify).toHaveBeenCalledWith({
            organizationId: 'organization-1',
            email: 'person@example.test',
        })
    })
})
