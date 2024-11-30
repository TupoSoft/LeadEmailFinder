import { type Collection, type Db, ObjectId } from 'mongodb'
import { generateObjectIdAsync } from '../database-util'
import type { EmailVerificationResult, EmailVerificationSource } from './dto'

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
    private emailVerification: EmailVerificationResult = {
        email: '',
        domain: '',
        localPart: '',
        sources: [],
        exists: false,
    }

    findById: (id: string) => Promise<EmailVerificationResult> = async () => {
        return this.emailVerification
    }

    findByEmail: (email: string) => Promise<EmailVerificationResult> = async () => {
        return this.emailVerification
    }

    save: (emailVerification: EmailVerificationResult) => Promise<void> = async emailVerification => {
        this.emailVerification = emailVerification
    }
}
