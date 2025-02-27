import { type Db, ObjectId } from 'mongodb'
import type { EmailVerificationResult, EmailVerificationSource } from './dto'
import { DESCENDING } from '../util/mongo'
import type { EmailPatternUsage } from '../domain'
import { booleanToCatchAllStatus, catchAllStatusToBoolean, existsToDeliveryStatus } from './util'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerificationResult) => Promise<EmailVerificationResult>
    findById: (id: string) => Promise<EmailVerificationResult>
    findByEmail: (email: string) => Promise<EmailVerificationResult>
    aggregateEmailPatternUsageForDomain: (domain: string) => Promise<EmailPatternUsage[]>
}

interface EmailVerificationSchema {
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
        email,
        domain,
        localPart,
        targetExchange,
        sources,
        exists,
        catchAll,
    }: EmailVerificationSchema): EmailVerificationResult {
        return {
            email,
            domain,
            localPart,
            targetExchange,
            sources,
            exists,
            catchAll: booleanToCatchAllStatus(catchAll),
            deliveryStatus: existsToDeliveryStatus(exists),
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

    aggregateEmailPatternUsageForDomain: (domain: string) => Promise<EmailPatternUsage[]> = async domain =>
        await this.collection
            .aggregate<EmailPatternUsage>([
                {
                    $match: {
                        domain,
                        format: {
                            $ne: null,
                        },
                    },
                },
                {
                    $group: {
                        _id: '$email',
                        latestEntry: {
                            $last: '$$ROOT',
                        },
                    },
                },
                {
                    $replaceRoot: {
                        newRoot: '$latestEntry',
                    },
                },
                {
                    $match: {
                        exists: true,
                    },
                },
                {
                    $group: {
                        _id: '$format',
                        usageCount: {
                            $count: {},
                        },
                    },
                },
                {
                    $sort: {
                        usageCount: DESCENDING,
                    },
                },
                {
                    $project: {
                        _id: false,
                        pattern: '$_id',
                        usageCount: true,
                    },
                },
            ])
            .toArray()
}
