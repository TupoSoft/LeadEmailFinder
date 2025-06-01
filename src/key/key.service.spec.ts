import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { KeyService } from './key.service'
import { Key } from './key.schema'
import { KeyPermissions } from './key.enum'
import { Model } from 'mongoose'

jest.mock('crypto', () => ({
    randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('mockedtoken123'),
    }),
}))

describe('KeyService', () => {
    let service: KeyService
    let keyModelMock: jest.Mocked<Model<Key>>

    beforeAll(async () => {
        const mockSave = jest.fn().mockResolvedValue({
            token: 'api_mockedtoken123',
            permissions: [KeyPermissions.READ],
            description: 'Test key',
        })

        const mockConstructor = jest.fn().mockImplementation((doc: Partial<Key>) => ({
            ...doc,
            save: mockSave,
        })) as unknown as jest.MockedClass<Model<Key>>

        Object.assign(mockConstructor, {
            findOne: jest.fn(),
            find: jest.fn(),
            updateOne: jest.fn(),
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KeyService,
                {
                    provide: getModelToken(Key.name),
                    useValue: mockConstructor,
                },
            ],
        }).compile()

        service = module.get<KeyService>(KeyService)
        keyModelMock = module.get(getModelToken(Key.name))
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('generateKey', () => {
        it('should generate a key with correct token format', async () => {
            const result = await service.generateKey([KeyPermissions.READ], 'Test key')

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
                exec: jest.fn().mockResolvedValue(mockKey),
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
                exec: jest.fn().mockResolvedValue(null),
            } as any)

            const result = await service.validateKeyForRoles('invalid_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return false for expired key', async () => {
            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            } as any)

            const result = await service.validateKeyForRoles('expired_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return true when no permissions required', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockKey),
            } as any)

            const result = await service.validateKeyForRoles('api_test', [])

            expect(result).toBe(true)
        })

        it('should return false when key lacks required permissions', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockKey),
            } as any)

            const result = await service.validateKeyForRoles('api_test', [KeyPermissions.WRITE])

            expect(result).toBe(false)
        })
    })

    describe('revokeKey', () => {
        it('should revoke admin key successfully', async () => {
            const mockKey = { permissions: [KeyPermissions.ADMIN] }

            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockKey),
            } as any)

            const mockUpdateResult = { modifiedCount: 1 }
            keyModelMock.updateOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockUpdateResult),
            } as any)

            const result = await service.revokeKey('api_test')

            expect(result).toEqual(mockUpdateResult)
            expect(keyModelMock.updateOne).toHaveBeenCalledWith(
                { token: 'api_test' },
                { expiresAt: expect.any(Date) as Date },
            )
        })

        it('should throw error for non-existent key', async () => {
            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            } as any)

            await expect(service.revokeKey('invalid_key')).rejects.toThrow('Key not found')
        })

        it('should throw error when trying to revoke non-admin key', async () => {
            const mockNonAdminKey = { permissions: [KeyPermissions.READ] }

            keyModelMock.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockNonAdminKey),
            } as any)

            await expect(service.revokeKey('read_key')).rejects.toThrow('Cannot revoke admin token')
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
