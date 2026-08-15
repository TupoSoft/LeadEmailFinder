import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import { ok } from 'assert/strict'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { Key } from '../models/key.entity'
import { KeyPermissions } from '../domain/key.enum'
import { AdminTokenRevocationForbidden, KeyNotFound } from '../api-key.error'

const randomBytesAsync = promisify(randomBytes)

@Injectable()
export class ApiKeyService {
    constructor(@InjectRepository(Key) private readonly keyRepo: Repository<Key>) {}

    async generateKey(permissions: KeyPermissions[], description?: string): Promise<Key> {
        const prefix = 'api_'
        const randomBytes = await randomBytesAsync(24)
        const token = `${prefix}${randomBytes.toString('hex')}`

        return await this.generateKeyWithToken(token, permissions, description)
    }

    async generateKeyWithToken(token: string, permissions: KeyPermissions[], description?: string): Promise<Key> {
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

        return await this.keyRepo.save(this.keyRepo.create({ token, permissions, description, expiresAt }))
    }

    async validateKeyForRoles(token: string, requiredPermissions: KeyPermissions[]): Promise<boolean> {
        const key = await this.keyRepo.findOne({
            where: { token, expiresAt: MoreThan(new Date()) },
        })

        if (!key) {
            return false
        }

        if (requiredPermissions.length === 0) {
            return true
        }

        return requiredPermissions.some(permission => key.permissions.includes(permission))
    }

    async findValidKey(token: string): Promise<Key | null> {
        return await this.keyRepo.findOne({
            where: { token, expiresAt: MoreThan(new Date()) },
        })
    }

    async revokeKey(token: string): Promise<Key> {
        const key = await this.keyRepo.findOneBy({ token })

        if (!key) {
            throw new KeyNotFound(token)
        }

        if (key.permissions.includes(KeyPermissions.ADMIN)) {
            throw new AdminTokenRevocationForbidden(token)
        }

        key.expiresAt = new Date()
        const revokedKey = await this.keyRepo.save(key)

        ok(revokedKey, `Failed to revoke key with token ${token}.`)

        return revokedKey
    }

    async listKeys(): Promise<string[]> {
        const keys = await this.keyRepo.find()
        return keys.map(key => key.token)
    }
}
