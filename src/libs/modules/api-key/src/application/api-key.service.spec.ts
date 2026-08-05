import { getRepositoryToken } from '@nestjs/typeorm'
import { Test, TestingModule } from '@nestjs/testing'
import { ApiKeyService } from './api-key.service'
import { Repository } from 'typeorm'
import { Key } from '../models/key.entity'
import { KeyPermissions } from '../domain/key.enum'

jest.mock('node:util', () => ({
    __esModule: true,
    ...jest.requireActual<typeof import('node:util')>('node:util'),
    promisify: jest.fn().mockReturnValue(
        jest.fn().mockResolvedValue({
            toString: jest.fn().mockReturnValue('mockedtoken123'),
        }),
    ),
}))

describe('KeyService', () => {
    let service: ApiKeyService
    let keyRepoMock: jest.Mocked<Pick<Repository<Key>, 'findOne' | 'findOneBy' | 'find' | 'save' | 'create'>>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApiKeyService,
                {
                    provide: getRepositoryToken(Key),
                    useValue: {
                        findOne: jest.fn(),
                        findOneBy: jest.fn(),
                        find: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get(ApiKeyService)
        keyRepoMock = module.get(getRepositoryToken(Key))
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('generateKey', () => {
        it('should generate a key with correct token format', async () => {
            const permissions = [KeyPermissions.READ]
            const description = 'Test key'
            const savedKey: Key = {
                id: 'some-uuid',
                token: 'api_mockedtoken123',
                permissions,
                description,
                expiresAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            keyRepoMock.create.mockReturnValue(savedKey)
            keyRepoMock.save.mockResolvedValue(savedKey)

            const result = await service.generateKey(permissions, description)

            expect(keyRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ token: 'api_mockedtoken123', permissions, description }),
            )
            expect(result.token).toBe('api_mockedtoken123')
            expect(result.permissions).toEqual(permissions)
            expect(result.description).toBe(description)
        })
    })

    describe('validateKeyForRoles', () => {
        it('should return true for valid key with matching permissions', async () => {
            const mockKey = { permissions: [KeyPermissions.READ, KeyPermissions.WRITE] } as Key

            keyRepoMock.findOne.mockResolvedValue(mockKey)

            const result = await service.validateKeyForRoles('api_test', [KeyPermissions.READ])

            expect(result).toBe(true)
            expect(keyRepoMock.findOne).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ token: 'api_test' }) }),
            )
        })

        it('should return false for non-existent key', async () => {
            keyRepoMock.findOne.mockResolvedValue(null)

            const result = await service.validateKeyForRoles('invalid_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return false for expired key', async () => {
            keyRepoMock.findOne.mockResolvedValue(null)

            const result = await service.validateKeyForRoles('expired_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return true when no permissions required', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] } as Key

            keyRepoMock.findOne.mockResolvedValue(mockKey)

            const result = await service.validateKeyForRoles('api_test', [])

            expect(result).toBe(true)
        })

        it('should return false when key lacks required permissions', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] } as Key

            keyRepoMock.findOne.mockResolvedValue(mockKey)

            const result = await service.validateKeyForRoles('api_test', [KeyPermissions.WRITE])

            expect(result).toBe(false)
        })
    })

    describe('revokeKey', () => {
        const now = new Date()

        beforeEach(() => {
            jest.useFakeTimers({ now })
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        it('should revoke key successfully', async () => {
            const mockKey = { permissions: [KeyPermissions.READ], token: 'api_test' } as Key
            const revokedKey = { ...mockKey, expiresAt: now }

            keyRepoMock.findOneBy.mockResolvedValue(mockKey)
            keyRepoMock.save.mockResolvedValue(revokedKey as Key)

            const result = await service.revokeKey('api_test')

            expect(result).toEqual(revokedKey)
            expect(keyRepoMock.findOneBy).toHaveBeenCalledWith({ token: 'api_test' })
            expect(keyRepoMock.save).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: now }))
        })

        it('should throw error for non-existent key', async () => {
            keyRepoMock.findOneBy.mockResolvedValue(null)

            await expect(service.revokeKey('invalid_key')).rejects.toThrow('Key invalid_key was not found')
        })

        it('should throw error when trying to revoke admin key', async () => {
            const mockAdminKey = { permissions: [KeyPermissions.ADMIN] } as Key

            keyRepoMock.findOneBy.mockResolvedValue(mockAdminKey)

            await expect(service.revokeKey('read_key')).rejects.toThrow('Admin token read_key cannot be revoked')
        })
    })

    describe('listKeys', () => {
        it('should return array of key tokens', async () => {
            const mockKeys = [{ token: 'api_key1' }, { token: 'api_key2' }] as Key[]

            keyRepoMock.find.mockResolvedValue(mockKeys)

            const result = await service.listKeys()

            expect(result).toEqual(['api_key1', 'api_key2'])
        })

        it('should return empty array when no keys exist', async () => {
            keyRepoMock.find.mockResolvedValue([])

            const result = await service.listKeys()

            expect(result).toEqual([])
        })
    })
})
