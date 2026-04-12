import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ok } from 'assert/strict'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { Key } from '../models/api-key.schema'
import { KeyPermissions } from '../domain/key.enum'
import { AdminTokenRevocationForbidden, KeyNotFound } from '../api-key.error'

const randomBytesAsync = promisify(randomBytes)

@Injectable()
export class ApiKeyService {
    constructor(@InjectModel(Key.name) private readonly keyModel: Model<Key>) {}

    async generateKey(permissions: KeyPermissions[], description?: string): Promise<Key> {
        const prefix = 'api_'
        const randomBytes = await randomBytesAsync(24)
        const token = `${prefix}${randomBytes.toString('hex')}`

        return await this.keyModel.insertOne({ token, permissions, description })
    }

    async validateKeyForRoles(token: string, requiredPermissions: KeyPermissions[]): Promise<boolean> {
        const key = await this.keyModel
            .findOne({
                token,
                expiresAt: { $gt: new Date() },
            })
            .lean()
            .exec()

        if (!key) {
            return false
        }

        if (requiredPermissions.length === 0) {
            return true
        }

        return requiredPermissions.some(permission => key.permissions.includes(permission))
    }

    async revokeKey(token: string): Promise<Key> {
        const key = await this.keyModel.findOne({ token }).lean().exec()

        if (!key) {
            throw new KeyNotFound(token)
        }

        if (key.permissions.includes(KeyPermissions.ADMIN)) {
            throw new AdminTokenRevocationForbidden(token)
        }

        const revokedKey = await this.keyModel
            .findOneAndUpdate({ token }, { expiresAt: new Date() }, { new: true })
            .lean()
            .exec()

        ok(revokedKey, `Failed to revoke key with token ${token}.`)

        return revokedKey
    }

    async listKeys(): Promise<string[]> {
        const keys = await this.keyModel.find().exec()
        return keys.map(key => key.token)
    }
}
