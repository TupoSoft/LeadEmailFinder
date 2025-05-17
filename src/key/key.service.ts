import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Key } from './key.schema'
import * as crypto from 'crypto'
import { KeyPermissions } from './key.enum'

@Injectable()
export class KeyService {
    constructor(@InjectModel(Key.name) private keyModel: Model<Key>) {}

    async generateKey(permissions: KeyPermissions[], description?: string): Promise<string> {
        const prefix = 'api_'
        const randomBytes = crypto.randomBytes(24).toString('hex')
        const token = `${prefix}${randomBytes}`

        const key = new this.keyModel({
            token,
            permissions,
            description,
            revoked: false,
        })

        await key.save()
        return token
    }

    async validateKeyForRoles(token: string, requiredPermissions: KeyPermissions[]): Promise<boolean> {
        const key = await this.keyModel
            .findOne({
                token,
                revoked: false,
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
    async revokeKey(token: string): Promise<boolean> {
        const result = await this.keyModel.updateOne({ token }, { revoked: true }).exec()

        return result.modifiedCount > 0
    }

    async listKeys(): Promise<string[]> {
        const keys = await this.keyModel.find().exec()
        return keys.map(key => key.token)
    }
}
