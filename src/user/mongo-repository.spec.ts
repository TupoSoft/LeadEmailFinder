/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { describe, expect, it, jest } from '@jest/globals'
import { type Collection, type FindCursor, MongoClient, ObjectId } from 'mongodb'
import { MongoUserRepository, type UserSchema } from './mongo-repository'
import type { User } from './entity'
import Mocked = jest.Mocked

describe('MongoUserRepository', () => {
    const mongoClient = new MongoClient('mongodb://localhost:27017')
    const db = mongoClient.db()
    const collection = db.collection('proxy') as Mocked<Collection>
    const mongoUserRepository = new MongoUserRepository(db)

    const id = '00000001f023854520830613'
    const _id = new ObjectId(id)
    const email = 'danilo@asw.eu'
    const password = 'odeseneradi2024'
    const createdAt = _id.getTimestamp()

    const userSchema: UserSchema = {
        _id,
        email,
        password,
    }

    const user: User = {
        id,
        email,
        password,
        createdAt,
    }

    describe('findAll', () => {
        it('should return all users', async () => {
            const cursor = collection.find() as Mocked<FindCursor<UserSchema>>
            cursor.toArray.mockResolvedValueOnce([userSchema])
            await expect(mongoUserRepository.findAll()).resolves.toStrictEqual([user])
        })
    })
})
