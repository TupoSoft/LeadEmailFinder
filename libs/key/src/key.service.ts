import { Injectable, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Key } from './key.schema'
import * as crypto from 'crypto'
import { KeyPermissions } from './key.enum'
import { AdminTokenRevocationForbidden, KeyNotFound } from './key.error'

@Injectable()
export class KeyService {
    constructor(@InjectModel(Key.name) private keyModel: Model<Key>) {}

    async generateKey(userId: string, permissions: KeyPermissions[], description?: string) {
        const prefix = 'api_'
        const randomBytes = crypto.randomBytes(24).toString('hex')
        const token = `${prefix}${randomBytes}`

        const key = new this.keyModel({
            token,
            permissions,
            description,
            userId: new Types.ObjectId(userId),
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

    async getKeyByToken(token: string) {
        const key = await this.keyModel.findOne({ token }).exec()
        if (!key) {
            throw new KeyNotFound(token)
        }
        return key
    }

    async getKeysByUserId(userId: string): Promise<Key[]> {
        return this.keyModel.find({ userId: new Types.ObjectId(userId) }).exec()
    }

    async revokeKey(token: string, userId?: string, isAdmin: boolean = false) {
        const key = await this.keyModel.findOne({ token }).exec()

        if (!key) {
            throw new KeyNotFound(token)
        }

        // Check if user owns the key or is admin
        if (!isAdmin && userId && key.userId.toString() !== userId) {
            throw new ForbiddenException('You can only revoke your own keys')
        }

        if (key.permissions.includes(KeyPermissions.ADMIN) && !isAdmin) {
            throw new AdminTokenRevocationForbidden(token)
        }

        const result = await this.keyModel.updateOne({ token }, { expiresAt: new Date() }).exec()
        return result
    }

    async revokeUserKeys(userId: string) {
        const result = await this.keyModel
            .updateMany({ userId: new Types.ObjectId(userId) }, { expiresAt: new Date() })
            .exec()
        return result
    }

    async listKeys(userId?: string): Promise<Key[]> {
        const query = userId ? { userId: new Types.ObjectId(userId) } : {}
        return this.keyModel.find(query).exec()
    }

    async deleteExpiredKeys() {
        const result = await this.keyModel
            .deleteMany({
                expiresAt: { $lt: new Date() },
            })
            .exec()
        return result
    }
}
