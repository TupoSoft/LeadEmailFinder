import type { CreateUserDto, UpdateUserDto } from './dto'
import type { User } from './entity'
import type { UserRepository } from './repository'
import { type Collection, type Db, ObjectId } from 'mongodb'
import { generateObjectIdAsync } from '../util/mongo'
import { ok } from 'node:assert'
import { UserNotFoundError } from './errors'
import { ZERO } from '../common/constants'

export type UserSchema = Omit<User, 'id' | 'createdAt'> & {
    _id: ObjectId
}

function convertSchemaToEntity(userSchema: UserSchema): User {
    const { _id, ...proxy } = userSchema
    return { id: _id.toHexString(), createdAt: _id.getTimestamp(), ...proxy }
}

export class MongoUserRepository implements UserRepository {
    private readonly collection: Collection<UserSchema>

    constructor(db: Db) {
        this.collection = db.collection('users')
    }

    async createIndices(): Promise<void> {
        await this.collection.createIndex('email', { unique: true })
    }

    async findAll(): Promise<User[]> {
        const userSchemas = await this.collection.find().toArray()
        return userSchemas.map(convertSchemaToEntity)
    }

    async findById(id: string): Promise<User> {
        const userSchema = await this.collection.findOne({ _id: new ObjectId(id) })
        ok(userSchema !== null, new UserNotFoundError('id', id))
        return convertSchemaToEntity(userSchema)
    }

    async findByEmail(email: string): Promise<User> {
        const userSchema = await this.collection.findOne({ email })
        ok(userSchema !== null, new UserNotFoundError('email', email))
        return convertSchemaToEntity(userSchema)
    }

    async update(id: string, user: UpdateUserDto): Promise<User> {
        const userSchema = await this.collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: { ...user, updatedAt: new Date() } },
            { returnDocument: 'after' },
        )

        ok(userSchema !== null, new UserNotFoundError('id', id))

        return convertSchemaToEntity(userSchema)
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        const _id = await generateObjectIdAsync()
        const { insertedId } = await this.collection.insertOne({
            ...createUserDto,
            _id,
            updatedAt: _id.getTimestamp(),
        })

        const id = insertedId.toHexString()
        const createdAt = insertedId.getTimestamp()
        const updatedAt = createdAt

        return {
            id,
            createdAt,
            updatedAt,
            ...createUserDto,
        }
    }

    async delete(id: string): Promise<void> {
        const { deletedCount } = await this.collection.deleteOne({ _id: new ObjectId(id) })
        ok(deletedCount > ZERO, new UserNotFoundError('id', id))
    }
}
