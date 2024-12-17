import { jest } from '@jest/globals'
import type { MongoClient as Client, Db as MongoDb, Collection, FindCursor as MongoFindCursor } from 'mongodb'

const findCursor = {
    toArray: jest.fn<typeof FindCursor.prototype.toArray>(),
}

export const FindCursor: <T>() => MongoFindCursor<T> = jest
    .fn<typeof FindCursor.prototype>()
    .mockImplementation(() => findCursor)

const collection = {
    find: jest.fn<typeof Collection.prototype.find>(() => FindCursor()),
    findOne: jest.fn<typeof Collection.prototype.findOne>(),
    insertOne: jest.fn<typeof Collection.prototype.insertOne>(),
    findOneAndUpdate: jest.fn<typeof Collection.prototype.findOneAndUpdate>(),
}

export const Db: () => MongoDb = jest.fn<typeof Db.prototype>().mockImplementation(() => ({
    collection: jest.fn<typeof Db.prototype.collection>(() => collection),
}))

export const MongoClient: () => Client = jest.fn<typeof MongoClient.prototype>(() => ({
    db: Db,
}))

export { ObjectId } from 'mongodb'
