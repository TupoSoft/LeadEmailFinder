import type { EmailVerification, EmailVerificationSource } from './entities'
import { type Collection, type Db, ObjectId } from 'mongodb'
import { generateObjectIdAsync } from './database-util'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerification) => Promise<void>
    findById: (id: string) => Promise<EmailVerification>
    findByEmail: (email: string) => Promise<EmailVerification>
}

interface EmailVerificationSchema {
    _id?: ObjectId
    email: string
    domain: string
    localPart: string
    format?: string
    targetExchange?: string
    verifiedAt?: Date
    exists: boolean
    sources: EmailVerificationSource[]
}

export class EmailVerificationNotFoundError extends Error {
    constructor(fieldName: string, fieldValue: string) {
        super(`EmailVerification with ${fieldName} ${fieldValue} not found`)
    }
}

export class MongoEmailVerificationRepository implements EmailVerificationRepository {
    private readonly collection: Collection<EmailVerificationSchema>

    constructor(db: Db) {
        this.collection = db.collection('emailVerifications')
        void this.collection.createIndex({ email: 1 })
    }

    findByEmail: (email: string) => Promise<EmailVerification> = async (email: string): Promise<EmailVerification> => {
        const dataModel = await this.collection.findOne({ email })
        if (dataModel === null) throw new EmailVerificationNotFoundError('email', email)
        return dataModel
    }

    async findById(id: string): Promise<EmailVerification> {
        const dataModel = await this.collection.findOne({ _id: new ObjectId(id) })
        if (dataModel === null) throw new EmailVerificationNotFoundError('id', id)
        return dataModel
    }

    async save(emailVerification: EmailVerification): Promise<void> {
        await this.collection.insertOne({ ...emailVerification, _id: await generateObjectIdAsync() })
    }
}
