/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { describe, expect, it, jest } from '@jest/globals'
import { type Collection, type FindCursor, MongoClient, ObjectId } from 'mongodb'
import { MongoUserRepository, type UserSchema } from './mongo-repository'
import type { User } from './entity'
import { UserNotFoundError } from './errors'
import type { CreateUserDto, UpdateUserDto } from './dto'
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

    describe('findById', () => {
        it('should return the user', async () => {
            collection.findOne.mockResolvedValueOnce(userSchema)
            await expect(mongoUserRepository.findById(user.id)).resolves.toStrictEqual(user)
        })

        it('should throw the UserNotFoundError', async () => {
            collection.findOne.mockResolvedValueOnce(null)
            await expect(mongoUserRepository.findById(user.id)).rejects.toThrow(new UserNotFoundError('id', user.id))
        })
    })

    describe('findByEmail', () => {
        it('should return the user', async () => {
            collection.findOne.mockResolvedValueOnce(userSchema)
            await expect(mongoUserRepository.findByEmail(user.id)).resolves.toStrictEqual(user)
        })

        it('should throw the UserNotFoundError', async () => {
            collection.findOne.mockResolvedValueOnce(null)
            await expect(mongoUserRepository.findByEmail(user.email)).rejects.toThrow(
                new UserNotFoundError('email', user.email),
            )
        })
    })

    describe('create', () => {
        const createUserDto: CreateUserDto = {
            email,
            password,
        }

        it('should return the user', async () => {
            collection.insertOne.mockResolvedValueOnce({ insertedId: _id, acknowledged: true })
            await expect(mongoUserRepository.create(createUserDto)).resolves.toStrictEqual(user)
        })
    })

    describe('update', () => {
        const newPassword = 'odeseneradi2025'
        const updateUserDto: UpdateUserDto = {
            password: newPassword,
        }

        const updatedUserSchema = { ...userSchema, password: newPassword }
        const updatedUser = { ...user, password: newPassword }

        it('should return the user', async () => {
            collection.findOneAndUpdate.mockResolvedValueOnce(updatedUserSchema)
            await expect(mongoUserRepository.update(id, updateUserDto)).resolves.toStrictEqual(updatedUser)
        })

        it('should throw the UserNotFoundError', async () => {
            collection.findOneAndUpdate.mockResolvedValueOnce(null)
            await expect(mongoUserRepository.update(id, updateUserDto)).rejects.toThrow(
                new UserNotFoundError('id', user.id),
            )
        })
    })

    describe('delete', () => {
        it('should delete the user', async () => {
            collection.findOneAndDelete.mockResolvedValueOnce(userSchema)
            await expect(mongoUserRepository.delete(id)).resolves.not.toThrow()
        })

        it('should throw the UserNotFoundError', async () => {
            collection.findOneAndDelete.mockResolvedValueOnce(null)
            await expect(mongoUserRepository.delete(id)).rejects.toThrow(new UserNotFoundError('id', user.id))
        })
    })
})
