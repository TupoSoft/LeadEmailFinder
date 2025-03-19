import { type Db, ObjectId, type WithId } from 'mongodb'
import type { EmailVerificationReason, EmailVerificationResult, EmailVerificationSource } from './dto'

export interface EmailVerificationRepository {
    upsert: (emailVerificationResult: EmailVerificationResult) => Promise<EmailVerificationResult>
    findById: (id: string) => Promise<EmailVerificationResult | null>
    findByEmail: (email: string) => Promise<EmailVerificationResult | null>
}

interface EmailVerificationSchema {
    email: string
    domain: string
    localPart: string
    format?: string
    targetExchange?: string
    mxDomain?: string
    exists: boolean | null
    catchAll: boolean | null
    reason?: EmailVerificationReason
    sources: EmailVerificationSource[]
    createdAt: Date
    updatedAt: Date
}

export class MongoEmailVerificationRepository implements EmailVerificationRepository {
    private readonly collection

    constructor(db: Db) {
        this.collection = db.collection<EmailVerificationSchema>('emailVerifications')
    }

    private static fromSchema({
        _id,
        email,
        domain,
        localPart,
        targetExchange,
        mxDomain,
        sources,
        exists,
        catchAll,
        reason,
    }: WithId<EmailVerificationSchema>): EmailVerificationResult {
        return {
            id: _id.toHexString(),
            email,
            domain,
            localPart,
            targetExchange,
            mxDomain,
            sources,
            exists,
            reason: reason ?? 'unknown',
            catchAll,
            verifiedAt: _id.getTimestamp().toISOString(),
        }
    }

    upsert = async ({
        id,
        exists,
        catchAll,
        reason,
        format,
        targetExchange,
        sources,
        mxDomain,
        email,
        localPart,
        domain,
    }: EmailVerificationResult): Promise<EmailVerificationResult> => {
        const record = await this.collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            {
                $set: {
                    exists,
                    catchAll,
                    reason,
                    format,
                    targetExchange,
                    sources,
                    mxDomain,
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    email,
                    domain,
                    localPart,
                    createdAt: new Date(),
                },
            },
            { returnDocument: 'after', upsert: true, ignoreUndefined: true },
        )

        if (record == null) {
            throw new Error('Upsert failed.')
        }

        return MongoEmailVerificationRepository.fromSchema(record)
    }

    async init(): Promise<void> {
        await this.collection.createIndex('email')
        await this.collection.createIndex(['domain', 'format'])
    }

    findByEmail = async (email: string): Promise<EmailVerificationResult | null> => {
        const record = await this.collection.findOne({ email })
        return record != null ? MongoEmailVerificationRepository.fromSchema(record) : record
    }

    async findById(id: string): Promise<EmailVerificationResult | null> {
        const record = await this.collection.findOne({ _id: new ObjectId(id) })
        return record != null ? MongoEmailVerificationRepository.fromSchema(record) : record
    }
}
