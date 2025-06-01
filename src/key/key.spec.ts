import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { KeyService } from './key.service'
import { Key } from './key.schema'
import { KeyPermissions } from './key.enum'

jest.mock('crypto', () => ({
    randomBytes: jest.fn().mockReturnValue(Buffer.from('mockedtoken123', 'hex')),
}))

describe('KeyService', () => {
    let service: KeyService

    let mockModel: any

    beforeEach(async () => {
        const mockSave = jest.fn().mockResolvedValue({
            token: 'api_mockedtoken123',
            permissions: [KeyPermissions.READ],
            description: 'Test key',
        })

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        mockModel = jest.fn().mockImplementation(doc => ({
            ...doc,
            save: mockSave,
        }))

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockModel.findOne = jest.fn().mockReturnValue({
            exec: jest.fn(),
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockModel.find = jest.fn().mockReturnValue({
            exec: jest.fn(),
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockModel.updateOne = jest.fn().mockReturnValue({
            exec: jest.fn(),
        })

        const module = await Test.createTestingModule({
            providers: [
                KeyService,
                {
                    provide: getModelToken(Key.name),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    useValue: mockModel,
                },
            ],
        }).compile()

        service = module.get<KeyService>(KeyService)
    })

    describe('generateKey', () => {
        it('should generate a key with correct token format', async () => {
            const result = await service.generateKey([KeyPermissions.READ], 'Test key')

            expect(result.token).toBe('api_mockedtoken123')
            expect(result.permissions).toEqual([KeyPermissions.READ])
        })
    })

    describe('validateKeyForRoles', () => {
        it('should return true for valid key with matching permissions', async () => {
            const mockKey = {
                permissions: [KeyPermissions.READ, KeyPermissions.WRITE],
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValue(mockKey)

            const result = await service.validateKeyForRoles('api_test', [KeyPermissions.READ])

            expect(result).toBe(true)
        })

        it('should return false for non-existent key', async () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValue(null)

            const result = await service.validateKeyForRoles('invalid_key', [KeyPermissions.READ])

            expect(result).toBe(false)
        })

        it('should return true when no permissions required', async () => {
            const mockKey = { permissions: [KeyPermissions.READ] }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValue(mockKey)

            const result = await service.validateKeyForRoles('api_test', [])

            expect(result).toBe(true)
        })
    })

    describe('revokeKey', () => {
        it('should revoke admin key successfully', async () => {
            const mockKey = { permissions: [KeyPermissions.ADMIN] }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValueOnce(mockKey)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.updateOne().exec.mockResolvedValueOnce({ modifiedCount: 1 })

            const result = await service.revokeKey('api_test')

            expect(result.modifiedCount).toBe(1)
        })

        it('should throw error for non-existent key', async () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValue(null)

            await expect(service.revokeKey('invalid_key')).rejects.toThrow('Key not found')
        })

        it('should throw error when trying to revoke non-admin key', async () => {
            const mockNonAdminKey = { permissions: [KeyPermissions.READ] }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.findOne().exec.mockResolvedValue(mockNonAdminKey)

            await expect(service.revokeKey('read_key')).rejects.toThrow('Cannot revoke admin token')
        })
    })

    describe('listKeys', () => {
        it('should return array of key tokens', async () => {
            const mockKeys = [{ token: 'api_key1' }, { token: 'api_key2' }]
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.find().exec.mockResolvedValue(mockKeys)

            const result = await service.listKeys()

            expect(result).toEqual(['api_key1', 'api_key2'])
        })

        it('should return empty array when no keys exist', async () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            mockModel.find().exec.mockResolvedValue([])

            const result = await service.listKeys()

            expect(result).toEqual([])
        })
    })
})
