/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { type Collection, type Db, type FindCursor, ObjectId, type WithId } from 'mongodb'
import type { Proxy } from './repository'
import { MongoProxyRepository, type ProxySchema } from './mongo-repository'

describe('MongoProxyRepository', () => {
    const dbMock = {
        collection: jest.fn<typeof Db.prototype.collection>(),
    } as unknown as jest.Mocked<Db>

    const collection = {
        find: jest.fn<typeof Collection.prototype.find>(),
        findOne: jest.fn<typeof Collection.prototype.findOne>(),
        insertOne: jest.fn<typeof Collection.prototype.insertOne>(),
        findOneAndUpdate: jest.fn<typeof Collection.prototype.findOneAndUpdate>(),
    } as unknown as jest.Mocked<Collection>

    dbMock.collection.mockReturnValue(collection)

    const PROXY_PORT = 33333

    const proxy: Proxy = {
        type: 'http',
        host: 'example.com',
        port: PROXY_PORT,
        user: 'example',
        password: 'example',
    }

    const id = '00000001f023854520830613'

    const proxySchema: ProxySchema = {
        _id: new ObjectId(id),
        ...proxy,
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    const mongoProxyRepository = new MongoProxyRepository(dbMock)

    describe('getAll', () => {
        it('should return an array of proxies', async () => {
            const documents: Array<WithId<ProxySchema>> = [proxySchema]

            collection.find.mockReturnValueOnce({
                toArray: jest.fn<() => Promise<Array<WithId<ProxySchema>>>>().mockResolvedValueOnce(documents),
            } as unknown as FindCursor<WithId<Proxy>>)

            const result = await mongoProxyRepository.getAll()
            expect(result).toEqual([{ ...proxy, id }])
        })
    })

    describe('getById', () => {
        it('should return a proxy', async () => {
            collection.findOne.mockResolvedValueOnce(proxySchema)

            const proxy = await mongoProxyRepository.getById(id)
            expect(proxy).toEqual({ ...proxy, id })
        })

        it('should return null when there is no such proxy', async () => {
            collection.findOne.mockResolvedValueOnce(null)
            await expect(mongoProxyRepository.getById(id)).resolves.toBe(null)
        })
    })

    describe('save', () => {
        it('should return a proxy with ID', async () => {
            collection.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId(id), acknowledged: true })
            const proxyWithId = await mongoProxyRepository.save(proxy)
            expect(proxyWithId).toEqual({ ...proxy, id })
        })
    })

    describe('update', () => {
        const newPassword = 'newPassword'

        it('should return an updated proxy', async () => {
            const proxySchemaWithNewPassword: ProxySchema = { ...proxySchema, password: newPassword }
            const proxyWithNewPassword: Proxy = { ...proxy, password: newPassword }

            collection.findOneAndUpdate.mockResolvedValueOnce(proxySchemaWithNewPassword)

            await expect(mongoProxyRepository.update(id, { password: newPassword })).resolves.toStrictEqual({
                ...proxyWithNewPassword,
                id,
            })
        })

        it('should return null if there is no proxy with ID', async () => {
            collection.findOneAndUpdate.mockResolvedValueOnce(null)
            await expect(mongoProxyRepository.update(id, { password: newPassword })).resolves.toBe(null)
        })
    })
})
