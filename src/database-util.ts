import { readFile } from 'fs/promises'
import { type Db, MongoClient, ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const randomBytesAsync = promisify(randomBytes)

async function getMongoUrl(): Promise<string> {
    try {
        const { MONGO_URL_FILE: mongoUrlFile } = process.env

        if (mongoUrlFile === undefined) {
            console.error(`The MONGO_URL_FILE variable is undefined.`)
            process.exit(1)
        }

        return await readFile(mongoUrlFile, 'utf-8')
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

export async function dbFactory(): Promise<Db> {
    try {
        const mongoUrl = await getMongoUrl()
        const mongoClient = new MongoClient(mongoUrl)
        return await mongoClient.connect().then(mongoClient => mongoClient.db())
    } catch (error) {
        console.error('MongoDB connection error:', error)
        process.exit(1)
    }
}

export async function generateObjectIdAsync(): Promise<ObjectId> {
    return await randomBytesAsync(12).then(buffer => new ObjectId(buffer.toString('hex')))
}
