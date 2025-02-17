import { type Db, ObjectId } from 'mongodb'
import { type EmailVerificationResponse, ExistenceStatus } from './dto'
import { DESCENDING, generateObjectIdAsync } from '../util/mongo'
import type { EmailPatternUsage } from '../domain'
import type { EmailVerificationResult } from './email-verifier'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerificationResponse) => Promise<void>
    findById: (id: string) => Promise<EmailVerificationResponse>
    findByEmail: (email: string) => Promise<EmailVerificationResponse>
    aggregateEmailPatternUsageForDomain: (domain: string) => Promise<EmailPatternUsage[]>
}

interface EmailVerificationSchema {
    _id: ObjectId
    email: string
    domain: string
    localPart: string
    format?: string
    targetExchange?: string
    exists: boolean | null
    verificationResults: Record<string, EmailVerificationResult>
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

    private static fromSchema({
        exists,
        verificationResults,
        domain,
        email,
        _id,
        format,
        localPart,
    }: EmailVerificationSchema): EmailVerificationResponse {
        const status =
            exists === null ? ExistenceStatus.Unknown : exists ? ExistenceStatus.Exists : ExistenceStatus.DoesNotExist

        return {
            status,
            verificationResults,
            domain,
            email,
            checkedAt: _id.getTimestamp(),
            format,
            username: localPart,
        }
    }

    private static async toSchema({
        status,
        username,
        email,
        domain,
        verificationResults,
        format,
        checkedAt,
    }: EmailVerificationResponse): Promise<EmailVerificationSchema> {
        const exists = status === ExistenceStatus.Unknown ? null : status === ExistenceStatus.Exists
        const localPart = username

        return {
            _id: await generateObjectIdAsync(),
            exists,
            localPart,
            email,
            domain,
            verificationResults,
            format,
        }
    }

    async init(): Promise<void> {
        await this.collection.createIndex('email')
        await this.collection.createIndex(['domain', 'format'])
    }

    findByEmail: (email: string) => Promise<EmailVerificationResponse> = async (
        email: string,
    ): Promise<EmailVerificationResponse> => {
        const dataModel = await this.collection.findOne({ email })
        if (dataModel === null) throw new EmailVerificationNotFoundError('email', email)
        return MongoEmailVerificationRepository.fromSchema(dataModel)
    }

    async findById(id: string): Promise<EmailVerificationResponse> {
        const dataModel = await this.collection.findOne({ _id: new ObjectId(id) })
        if (dataModel === null) throw new EmailVerificationNotFoundError('id', id)
        return MongoEmailVerificationRepository.fromSchema(dataModel)
    }

    async save(emailVerification: EmailVerificationResponse): Promise<void> {
        const schema = await MongoEmailVerificationRepository.toSchema(emailVerification)
        await this.collection.insertOne(schema)
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

export class MockEmailVerificationRepository implements EmailVerificationRepository {
    aggregateEmailPatternUsageForDomain!: (domain: string) => Promise<EmailPatternUsage[]>

    findById!: (id: string) => Promise<EmailVerificationResponse>

    findByEmail!: (email: string) => Promise<EmailVerificationResponse>

    save!: (emailVerification: EmailVerificationResponse) => Promise<void>
}
