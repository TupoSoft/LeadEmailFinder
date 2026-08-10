import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { readFileSync } from 'node:fs'
import { Key } from '../models/key.entity'
import { KeyPermissions } from '../domain/key.enum'

function getAdminKeyToken(): string | undefined {
    const file = process.env['ADMIN_API_KEY_FILE']
    if (file) {
        try {
            return readFileSync(file, 'utf8').trim()
        } catch {
            // fall through
        }
    }
    return process.env['ADMIN_API_KEY']
}

@Injectable()
export class AdminKeySeeder implements OnModuleInit {
    private readonly logger = new Logger(AdminKeySeeder.name)

    constructor(@InjectRepository(Key) private readonly keyRepo: Repository<Key>) {}

    async onModuleInit(): Promise<void> {
        const token = getAdminKeyToken()
        if (!token) {
            this.logger.warn('ADMIN_API_KEY not set, skipping admin key seeding')
            return
        }

        const existing = await this.keyRepo.findOneBy({ token })
        if (existing) {
            const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            const permissions = existing.permissions.includes(KeyPermissions.ADMIN)
                ? existing.permissions
                : [...existing.permissions, KeyPermissions.ADMIN]

            if (permissions !== existing.permissions || existing.expiresAt <= new Date()) {
                existing.permissions = permissions
                existing.expiresAt = expiresAt
                await this.keyRepo.save(existing)
            }

            return
        }

        await this.keyRepo.save(
            this.keyRepo.create({
                token,
                permissions: [KeyPermissions.ADMIN],
                description: 'Default admin key',
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            }),
        )
    }
}
