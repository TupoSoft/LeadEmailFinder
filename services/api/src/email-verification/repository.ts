import { type Db, ObjectId, type WithId } from 'mongodb'
import type {
    CreateEmailVerification,
    EmailVerificationReason,
    EmailVerificationResult,
    EmailVerificationSource,
} from './dto'
import { booleanToCatchAllStatus, catchAllStatusToBoolean, existsToDeliveryStatus } from './util'

export interface EmailVerificationRepository {
    save: (createEmailVerification: CreateEmailVerification) => Promise<EmailVerificationResult>
    findById: (id: string) => Promise<EmailVerificationResult | null>
    findByEmail: (email: string) => Promise<EmailVerificationResult | null>
}

interface EmailVerificationSchema {
    email: string
    domain: string
    localPart: string
    format?: string
    targetExchange?: string
    exists: boolean | null
    catchAll: boolean | null
    reason?: EmailVerificationReason
    sources: EmailVerificationSource[]
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
        reason,
    }: EmailVerificationResult): EmailVerificationSchema {
        return {
            email,
            domain,
            localPart,
            targetExchange,
            sources,
            exists,
            format,
            reason,
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
        reason,
    }: WithId<EmailVerificationSchema>): EmailVerificationResult {
        return {
            id: _id.toHexString(),
            email,
            domain,
            localPart,
            targetExchange,
            sources,
            exists,
            reason: reason ?? 'unknown',
            catchAll: booleanToCatchAllStatus(catchAll),
            deliveryStatus: existsToDeliveryStatus(exists),
            verifiedAt: _id.getTimestamp().toISOString(),
        }
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

    async save(createEmailVerification: CreateEmailVerification): Promise<EmailVerificationResult> {
        const { insertedId: id } = await this.collection.insertOne(
            MongoEmailVerificationRepository.toSchema(createEmailVerification),
        )

        return {
            id: id.toHexString(),
            ...createEmailVerification,
            verifiedAt: id.getTimestamp().toISOString(),
        }
    }
}
