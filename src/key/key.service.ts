import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Key } from './key.schema'
import * as crypto from 'crypto'
import { KeyPermissions } from './key.enum'

@Injectable()
export class KeyService {
    constructor(@InjectModel(Key.name) private keyModel: Model<Key>) {}

    async generateKey(permissions: KeyPermissions[], description?: string) {
        const prefix = 'api_'
        const randomBytes = crypto.randomBytes(24).toString('hex')
        const token = `${prefix}${randomBytes}`

        const key = new this.keyModel({
            token,
            permissions,
            description,
        })

        const savedKey = await key.save()
        return savedKey
    }

    async validateKeyForRoles(token: string, requiredPermissions: KeyPermissions[]): Promise<boolean> {
        const key = await this.keyModel
            .findOne({
                token,
                expiresAt: { $gt: new Date() },
            })
            .exec()

        if (!key) {
            return false
        }

        if (requiredPermissions.length === 0) {
            return true
        }

        return requiredPermissions.some(permission => key.permissions.includes(permission))
    }

    async revokeKey(token: string) {
        const key = await this.keyModel.findOne({ token }).exec()

        if (!key) {
            throw new Error('Key not found')
        }

        if (!key.permissions.includes(KeyPermissions.ADMIN)) {
            throw new Error('Cannot revoke admin token')
        }

        const result = await this.keyModel.updateOne({ token }, { expiresAt: new Date() }).exec()
        return result
    }

    async listKeys(): Promise<string[]> {
        const keys = await this.keyModel.find().exec()
        return keys.map(key => key.token)
    }
}
