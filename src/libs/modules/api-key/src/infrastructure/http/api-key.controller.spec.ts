import { Test } from '@nestjs/testing'
import { ApiKeyController } from './api-key.controller'
import { ApiKeyService } from '../../application/api-key.service'
import { KeyPermissions } from '../../domain/key.enum'
import { AdminTokenRevocationForbidden, KeyNotFound } from '../../api-key.error'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ApiKeyGuard } from '../../application/api-key.guard'
import { GUARDS_METADATA } from '@nestjs/common/constants'

describe('ApiKeyController', () => {
    let controller: ApiKeyController
    let service: jest.Mocked<ApiKeyService>

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [ApiKeyController],
            providers: [
                {
                    provide: ApiKeyService,
                    useValue: {
                        generateKey: jest.fn(),
                        revokeKey: jest.fn(),
                        validateKeyForRoles: jest.fn(),
                    },
                },
            ],
        }).compile()

        controller = moduleRef.get(ApiKeyController)
        service = moduleRef.get(ApiKeyService)
    })

    it('requires an admin key for API key management', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ApiKeyController)).toEqual([ApiKeyGuard])
        expect(Reflect.getMetadata('permissions', ApiKeyController)).toEqual([KeyPermissions.ADMIN])
        expect(Reflect.getMetadata('isPublic', ApiKeyController)).toBeUndefined()
    })

    it('generates a read key when permissions are omitted', async () => {
        const key = { token: 'api_token', permissions: [KeyPermissions.READ] }
        service.generateKey.mockResolvedValue(key as any)

        await expect(controller.generateKey({})).resolves.toEqual({ apiKey: key })
        expect(service.generateKey).toHaveBeenCalledWith([KeyPermissions.READ], undefined)
    })

    it('maps key revocation domain errors to HTTP exceptions', async () => {
        service.revokeKey.mockRejectedValueOnce(new KeyNotFound('missing'))
        await expect(controller.revokeKey('missing')).rejects.toBeInstanceOf(NotFoundException)

        service.revokeKey.mockRejectedValueOnce(new AdminTokenRevocationForbidden('admin'))
        await expect(controller.revokeKey('admin')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('checks requested permissions', async () => {
        service.validateKeyForRoles.mockResolvedValue(true)

        await expect(
            controller.checkKeyPermissions({ token: 'api_token', requiredPermissions: [KeyPermissions.WRITE] }),
        ).resolves.toEqual({ allowed: true })
        expect(service.validateKeyForRoles).toHaveBeenCalledWith('api_token', [KeyPermissions.WRITE])
    })
})
