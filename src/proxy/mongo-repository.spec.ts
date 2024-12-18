/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { type Collection, type FindCursor, MongoClient, ObjectId, type WithId } from 'mongodb'
import { MongoProxyRepository, type ProxySchema } from './mongo-repository'
import type { ProxyFvo } from './dto'
import Mocked = jest.Mocked

describe('MongoProxyRepository', () => {
    const mongoClient = new MongoClient('mongodb://localhost:27017')
    const db = mongoClient.db()
    const collection = db.collection('proxy') as Mocked<Collection>

    const PROXY_PORT = 33333

    const proxyFvo: ProxyFvo = {
        type: 'http',
        host: 'example.com',
        port: PROXY_PORT,
        user: 'example',
        password: 'example',
    }

    const id = '00000001f023854520830613'

    const proxySchema: ProxySchema = {
        ...proxyFvo,
        _id: new ObjectId(id),
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    const mongoProxyRepository = new MongoProxyRepository(db)

    describe('getAll', () => {
        it('should return an array of proxies', async () => {
            const documents: Array<WithId<ProxySchema>> = [proxySchema]

            const cursor = collection.find() as Mocked<FindCursor>
            cursor.toArray.mockResolvedValueOnce(documents)

            const result = await mongoProxyRepository.getAll()
            expect(result).toEqual([{ ...proxyFvo, id }])
        })
    })

    describe('getById', () => {
        it('should return a proxyFvo', async () => {
            collection.findOne.mockResolvedValueOnce(proxySchema)

            const proxy = await mongoProxyRepository.getById(id)
            expect(proxy).toEqual({ ...proxy, id })
        })

        it('should return null when there is no such proxyFvo', async () => {
            collection.findOne.mockResolvedValueOnce(null)
            await expect(mongoProxyRepository.getById(id)).resolves.toBe(null)
        })
    })

    describe('save', () => {
        it('should return a proxyFvo with ID', async () => {
            collection.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId(id), acknowledged: true })
            const proxyWithId = await mongoProxyRepository.save(proxyFvo)
            expect(proxyWithId).toEqual({ ...proxyFvo, id })
        })
    })

    describe('update', () => {
        const newPassword = 'newPassword'

        it('should return an updated proxyFvo', async () => {
            const proxySchemaWithNewPassword: ProxySchema = { ...proxySchema, password: newPassword }
            const proxyWithNewPassword: ProxyFvo = { ...proxyFvo, password: newPassword }

            collection.findOneAndUpdate.mockResolvedValueOnce(proxySchemaWithNewPassword)

            await expect(mongoProxyRepository.update(id, { password: newPassword })).resolves.toStrictEqual({
                ...proxyWithNewPassword,
                id,
            })
        })

        it('should return null if there is no proxyFvo with ID', async () => {
            collection.findOneAndUpdate.mockResolvedValueOnce(null)
            await expect(mongoProxyRepository.update(id, { password: newPassword })).resolves.toBe(null)
        })
    })
})
