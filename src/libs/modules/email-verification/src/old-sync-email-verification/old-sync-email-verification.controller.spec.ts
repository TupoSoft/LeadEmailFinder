import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Mapper } from '@automapper/core'

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

    it('passes only the authenticated organization and query email to verification', async () => {
        const verificationResult = { email: 'person@example.test' }
        const mappedResult = { email: 'person@example.test' }
        const emailVerificationService: jest.Mocked<Pick<IEmailVerificationService, 'verify'>> = {
            verify: jest.fn().mockResolvedValue(verificationResult),
        }
        const mapper = { map: jest.fn().mockReturnValue(mappedResult) }
        const controller = new OldSyncEmailVerificationController(
            emailVerificationService as IEmailVerificationService,
            mapper as unknown as Mapper,
        )
        const principal = { organizationId: 'organization-1' } as AuthPrincipal

        await expect(controller.verifyEmail({ email: 'person@example.test' }, principal)).resolves.toBe(mappedResult)
        expect(emailVerificationService.verify).toHaveBeenCalledWith({
            organizationId: 'organization-1',
            email: 'person@example.test',
        })
    })
})
