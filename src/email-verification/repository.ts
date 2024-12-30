import { type Collection, type Db, ObjectId } from 'mongodb'
import type { EmailVerificationResult, EmailVerificationSource } from './dto'
import { generateObjectIdAsync } from '../util/mongo'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerificationResult) => Promise<void>
    findById: (id: string) => Promise<EmailVerificationResult>
    findByEmail: (email: string) => Promise<EmailVerificationResult>
}

interface EmailVerificationSchema {
    _id?: ObjectId
    email: string
    domain: string
    localPart: string
    format?: string
    targetExchange?: string
    verifiedAt?: Date
    exists: boolean | null
    isDisposable: boolean,
    isFree: boolean,
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

    findByEmail: (email: string) => Promise<EmailVerificationResult> = async (
        email: string,
    ): Promise<EmailVerificationResult> => {
        const dataModel = await this.collection.findOne({ email })
        if (dataModel === null) throw new EmailVerificationNotFoundError('email', email)
        return dataModel
    }

    async findById(id: string): Promise<EmailVerificationResult> {
        const dataModel = await this.collection.findOne({ _id: new ObjectId(id) })
        if (dataModel === null) throw new EmailVerificationNotFoundError('id', id)
        return dataModel
    }

    async save(emailVerification: EmailVerificationResult): Promise<void> {
        await this.collection.insertOne({ ...emailVerification, _id: await generateObjectIdAsync() })
    }
}

export class MockEmailVerificationRepository implements EmailVerificationRepository {
    findById!: (id: string) => Promise<EmailVerificationResult>

    findByEmail!: (email: string) => Promise<EmailVerificationResult>

    save!: (emailVerification: EmailVerificationResult) => Promise<void>
}
