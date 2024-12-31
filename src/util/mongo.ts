import { readFile } from 'fs/promises'
import { MongoClient, ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { EXIT_FAILURE } from '../common/constants'

export const DESCENDING = -1

const randomBytesAsync = promisify(randomBytes)

async function getMongoUrl(): Promise<string> {
    try {
        const { env } = process
        const { MONGO_URL_FILE: mongoUrlFile } = env

        if (mongoUrlFile === undefined) {
            console.error(`The MONGO_URL_FILE variable is undefined.`)
            process.exit(EXIT_FAILURE)
        }

        return await readFile(mongoUrlFile, 'utf-8')
    } catch (error) {
        console.error(error)
        process.exit(EXIT_FAILURE)
    }
}

export async function getMongoClient(): Promise<MongoClient> {
    try {
        const mongoUrl = await getMongoUrl()
        const mongoClient = new MongoClient(mongoUrl)
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
