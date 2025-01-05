import { MongoClient, ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { EXIT_FAILURE } from '../common/constants'
import { MONGO_URL } from '../common/env'

export const DESCENDING = -1

const randomBytesAsync = promisify(randomBytes)

export async function getMongoClient(): Promise<MongoClient> {
    try {
        const mongoClient = new MongoClient(MONGO_URL)
        return await mongoClient.connect()
    } catch (error) {
        console.error('MongoDB connection error:', error)
        process.exit(EXIT_FAILURE)
    }
}

export async function generateObjectIdAsync(): Promise<ObjectId> {
    const BYTES_FOR_OBJECT_ID = 0x0c
    return await randomBytesAsync(BYTES_FOR_OBJECT_ID).then(buffer => new ObjectId(buffer.toString('hex')))
}
