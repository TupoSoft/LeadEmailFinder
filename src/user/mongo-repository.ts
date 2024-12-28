import type { CreateUserDto, UpdateUserDto } from './dto'
import type { User } from './entity'
import type { UserRepository } from './repository'
import { type Collection, type Db, ObjectId } from 'mongodb'
import { generateObjectIdAsync } from '../util/mongo'
import { ZERO } from '../common/constants'

type UserSchema = Omit<User, 'id' | 'createdAt'> & {
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

    async findAll(): Promise<User[]> {
        const userSchemas = await this.collection.find().toArray()
        return userSchemas.map(convertSchemaToEntity)
    }

    async findById(id: string): Promise<User | null> {
        const userSchema = await this.collection.findOne({ _id: new ObjectId(id) })
        return userSchema != null ? convertSchemaToEntity(userSchema) : userSchema
    }

    async findByEmail(email: string): Promise<User | null> {
        const userSchema = await this.collection.findOne({ email })
        return userSchema != null ? convertSchemaToEntity(userSchema) : userSchema
    }

    async update(id: string, user: UpdateUserDto): Promise<User | null> {
        const userSchema = await this.collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: user },
            { returnDocument: 'after' },
        )

        return userSchema != null ? convertSchemaToEntity(userSchema) : null
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        const { insertedId } = await this.collection.insertOne({
            ...createUserDto,
            _id: await generateObjectIdAsync(),
        })

        return { ...createUserDto, id: insertedId.toHexString(), createdAt: insertedId.getTimestamp() }
    }

    async delete(id: string): Promise<boolean> {
        const { deletedCount } = await this.collection.deleteOne({ _id: new ObjectId(id) })
        return deletedCount > ZERO
    }
}
