import { MongoClient, ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import type { ConfigService, Environment } from '../common'
import { EXIT_FAILURE } from '../common'
import type { Logger } from '../logging'

const randomBytesAsync = promisify(randomBytes)

export class MongoClientCreator {
    constructor(
        private readonly configService: ConfigService<Environment>,
        private readonly logger: Logger,
    ) {}

    async create(): Promise<MongoClient> {
        try {
            const mongoUrl = this.configService.get('MONGO_URL')
            const mongoClient = new MongoClient(mongoUrl)
            return await mongoClient.connect()
        } catch (error) {
            this.logger.error(`MongoDB connection error: ${String(error)}`)
            process.exit(EXIT_FAILURE)
        }
    }
}

export async function generateObjectIdAsync(): Promise<ObjectId> {
    const BYTES_FOR_OBJECT_ID = 0x0c
    return await randomBytesAsync(BYTES_FOR_OBJECT_ID).then(buffer => new ObjectId(buffer.toString('hex')))
}
