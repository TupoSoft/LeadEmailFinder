import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AdminKeySeeder } from './admin-key-seeder.service'
import { Key } from '../models/key.entity'
import { KeyPermissions } from '../domain/key.enum'

describe('AdminKeySeeder', () => {
    const originalAdminKey = process.env['ADMIN_API_KEY']
    const originalAdminKeyFile = process.env['ADMIN_API_KEY_FILE']
    let seeder: AdminKeySeeder
    let keyRepo: {
        findOneBy: jest.Mock
        create: jest.Mock
        save: jest.Mock
    }
    let adminKeyDirectory: string

    beforeEach(async () => {
        adminKeyDirectory = mkdtempSync(join(tmpdir(), 'lead-email-finder-admin-key-'))
        process.env['ADMIN_API_KEY_FILE'] = join(adminKeyDirectory, 'admin_apikey')
        delete process.env['ADMIN_API_KEY']
        writeFileSync(process.env['ADMIN_API_KEY_FILE'], 'admin-token\n')

        const moduleRef = await Test.createTestingModule({
            providers: [
                AdminKeySeeder,
                {
                    provide: getRepositoryToken(Key),
                    useValue: {
                        findOneBy: jest.fn(),
                        create: jest.fn((value: Partial<Key>) => value),
                        save: jest.fn(),
                    },
                },
            ],
        }).compile()

        seeder = moduleRef.get(AdminKeySeeder)
        keyRepo = moduleRef.get(getRepositoryToken(Key))
    })

    afterEach(() => {
        if (originalAdminKey === undefined) {
            delete process.env['ADMIN_API_KEY']
        } else {
            process.env['ADMIN_API_KEY'] = originalAdminKey
        }

        if (originalAdminKeyFile === undefined) {
            delete process.env['ADMIN_API_KEY_FILE']
        } else {
            process.env['ADMIN_API_KEY_FILE'] = originalAdminKeyFile
        }

        rmSync(adminKeyDirectory, { recursive: true, force: true })
    })

    it('creates an admin key from ADMIN_API_KEY_FILE', async () => {
        keyRepo.findOneBy.mockResolvedValue(null)

        await seeder.onModuleInit()

        expect(keyRepo.findOneBy).toHaveBeenCalledWith({ token: 'admin-token' })
        expect(keyRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                token: 'admin-token',
                permissions: [KeyPermissions.ADMIN],
            }),
        )
        expect(keyRepo.save).toHaveBeenCalled()
    })

    it('upgrades an existing configured key to an active admin key', async () => {
        const key = {
            token: 'admin-token',
            permissions: [KeyPermissions.READ],
            expiresAt: new Date(0),
        } as Key
        keyRepo.findOneBy.mockResolvedValue(key)

        await seeder.onModuleInit()

        expect(key.permissions).toEqual([KeyPermissions.READ, KeyPermissions.ADMIN])
        expect(key.expiresAt).toBeInstanceOf(Date)
        expect(key.expiresAt.getTime()).toBeGreaterThan(Date.now())
        expect(keyRepo.save).toHaveBeenCalledWith(key)
    })
})
