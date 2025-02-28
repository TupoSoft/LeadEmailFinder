import { type Db, ObjectId } from 'mongodb'
import type { EmailVerificationResult, EmailVerificationSource } from './dto'
import { booleanToCatchAllStatus, catchAllStatusToBoolean, existsToDeliveryStatus } from './util'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerificationResult) => Promise<EmailVerificationResult>
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
    exists: boolean | null
    catchAll: boolean | null
    sources: EmailVerificationSource[]
}

export class EmailVerificationNotFoundError extends Error {
    constructor(fieldName: string, fieldValue: string) {
        super(`EmailVerification with ${fieldName} ${fieldValue} not found`)
    }
}

export class MongoEmailVerificationRepository implements EmailVerificationRepository {
    private readonly collection

    constructor(db: Db) {
        this.collection = db.collection<EmailVerificationSchema>('emailVerifications')
    }

    private static toSchema({
        email,
        domain,
        localPart,
        targetExchange,
        sources,
        exists,
        format,
        catchAll,
    }: EmailVerificationResult): EmailVerificationSchema {
        return {
            email,
            domain,
            localPart,
            targetExchange,
            sources,
            exists,
            format,
            catchAll: catchAllStatusToBoolean(catchAll),
        }
    }

    private static fromSchema({
        _id,
        email,
        domain,
        localPart,
        targetExchange,
        sources,
        exists,
        catchAll,
    }: EmailVerificationSchema): EmailVerificationResult {
        return {
            id: _id?.toHexString(),
            email,
            domain,
            localPart,
            targetExchange,
            sources,
            exists,
            catchAll: booleanToCatchAllStatus(catchAll),
            deliveryStatus: existsToDeliveryStatus(exists),
            verifiedAt: _id?.getTimestamp().toISOString(),
        }
    }

    async init(): Promise<void> {
        await this.collection.createIndex('email')
        await this.collection.createIndex(['domain', 'format'])
    }

    findByEmail: (email: string) => Promise<EmailVerificationResult> = async (
        email: string,
    ): Promise<EmailVerificationResult> => {
        const schema = await this.collection.findOne({ email })
        if (schema === null) throw new EmailVerificationNotFoundError('email', email)
        return MongoEmailVerificationRepository.fromSchema(schema)
    }

    async findById(id: string): Promise<EmailVerificationResult> {
        const schema = await this.collection.findOne({ _id: new ObjectId(id) })
        if (schema === null) throw new EmailVerificationNotFoundError('id', id)
        return MongoEmailVerificationRepository.fromSchema(schema)
    }

    async save(emailVerification: EmailVerificationResult): Promise<EmailVerificationResult> {
        const { insertedId: id } = await this.collection.insertOne(
            MongoEmailVerificationRepository.toSchema(emailVerification),
        )

        return {
            id: id.toHexString(),
            ...emailVerification,
            verifiedAt: id.getTimestamp().toISOString(),
        }
    }
}
