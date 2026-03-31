import { getModelToken } from '@nestjs/mongoose'
import { Test, TestingModule } from '@nestjs/testing'
import { ApiKeyService } from './api-key.service'
import { Key } from './models/api-key.schema'
import { Model, Types } from 'mongoose'
import { KeyPermissions } from '@tuposoft/lead-email-finder/key/key.enum'

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
    let keyModelMock: jest.Mocked<Model<Key>>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApiKeyService,
                {
                    provide: getModelToken(Key.name, 'api-key'),
                    useValue: {
                        findOne: jest.fn(),
                        find: jest.fn(),
                        findOneAndUpdate: jest.fn(),
                        insertOne: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get(ApiKeyService)
        keyModelMock = module.get(getModelToken(Key.name, 'api-key'))
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('generateKey', () => {
        it('should generate a key with correct token format', async () => {
            const permissions = [KeyPermissions.READ]
            const description = 'Test key'

            keyModelMock.insertOne.mockResolvedValueOnce({
                _id: new Types.ObjectId(),
                token: 'api_mockedtoken123',
                permissions,
                description,
            } as any)

            const result = await service.generateKey([KeyPermissions.READ], description)

            expect(keyModelMock.insertOne).toHaveBeenCalledWith({
                token: 'api_mockedtoken123',
                permissions,
                description,
            })

            expect(result.token).toBe('api_mockedtoken123')
            expect(result.permissions).toEqual([KeyPermissions.READ])
            expect(result.description).toBe('Test key')
        })
    })

    describe('validateKeyForRoles', () => {
        it('should return true for valid key with matching permissions', async () => {
            const mockKey = {
                permissions: [KeyPermissions.READ, KeyPermissions.WRITE],
            }

            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockKey),
                }),
            } as any)

            const result = await service.validateKeyForRoles('api_test', [KeyPermissions.READ])

            expect(result).toBe(true)
            expect(keyModelMock.findOne).toHaveBeenCalledWith({
                token: 'api_test',
                expiresAt: { $gt: expect.any(Date) as Date },
            })
        })

        it('should return false for non-existent key', async () => {
            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                }),
            } as any)

            const result = await service.validateKeyForRoles('invalid_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return false for expired key', async () => {
            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                }),
            } as any)

            const result = await service.validateKeyForRoles('expired_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return true when no permissions required', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockKey),
                }),
            } as any)

            const result = await service.validateKeyForRoles('api_test', [])

            expect(result).toBe(true)
        })

        it('should return false when key lacks required permissions', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockKey),
                }),
            } as any)

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

        it('should revoke admin key successfully', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockKey),
                }),
            } as any)

            keyModelMock.findOneAndUpdate.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockKey),
                }),
            } as any)

            const result = await service.revokeKey('api_test')

            expect(result).toEqual(mockKey)
            expect(keyModelMock.findOneAndUpdate).toHaveBeenCalledWith(
                { token: 'api_test' },
                { expiresAt: now },
                { new: true },
            )
        })

        it('should throw error for non-existent key', async () => {
            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                }),
            } as any)

            await expect(service.revokeKey('invalid_key')).rejects.toThrow('Key invalid_key was not found')
        })

        it('should throw error when trying to revoke admin key', async () => {
            const mockAdminKey = { permissions: [KeyPermissions.ADMIN] }

            keyModelMock.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockAdminKey),
                }),
            } as any)

            await expect(service.revokeKey('read_key')).rejects.toThrow('Admin token read_key cannot be revoked')
        })
    })

    describe('listKeys', () => {
        it('should return array of key tokens', async () => {
            const mockKeys = [{ token: 'api_key1' }, { token: 'api_key2' }]

            keyModelMock.find.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockKeys),
            } as any)

            const result = await service.listKeys()

            expect(result).toEqual(['api_key1', 'api_key2'])
        })

        it('should return empty array when no keys exist', async () => {
            keyModelMock.find.mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
            } as any)

            const result = await service.listKeys()

            expect(result).toEqual([])
        })
    })
})
