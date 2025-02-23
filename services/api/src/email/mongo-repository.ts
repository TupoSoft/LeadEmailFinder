import type { EmailRecord, EmailRepository, FindAllFilters } from './repository'
import { type Db, type Filter, MongoServerError, type WithId } from 'mongodb'
import type { CreateEmailRecord, UpdateEmailRecord } from './dto'
import { ok } from 'node:assert'

export type EmailSchema = Omit<EmailRecord, 'email'> & {
    _id: string
}

export class MongoEmailRepository implements EmailRepository {
    private static readonly COLLECTION_NAME = 'emails'
    private static readonly ALREADY_EXISTS_ERROR_CODE = 11000
    private readonly collection

    constructor(db: Db) {
        this.collection = db.collection<EmailSchema>(MongoEmailRepository.COLLECTION_NAME)
    }

    private static fromSchema({
        _id,
        domain,
        exists,
        lastVerificationId,
        createdAt,
        updatedAt,
        username,
        format,
    }: WithId<EmailSchema>): EmailRecord {
        return {
            email: _id,
            username,
            format,
            domain,
            exists,
            lastVerificationId,
            createdAt,
            updatedAt,
        }
    }

    init = async (): Promise<void> => {
        const exists = 1
        const domain = 1
        const format = 1

        await this.collection.createIndex({ exists, domain, format })
    }

    findByIdOrCreate = async ({
        format,
        domain,
        exists,
        username,
        lastVerificationId,
        email,
    }: CreateEmailRecord): Promise<EmailRecord> => {
        const result = await this.collection.findOneAndUpdate(
            { _id: email },
            {
                $setOnInsert: {
                    format,
                    domain,
                    username,
                    createdAt: new Date(),
                },
                $set: {
                    exists,
                    lastVerificationId,
                    updatedAt: new Date(),
                },
            },
            {
                returnDocument: 'after',
                upsert: true,
                ignoreUndefined: true,
            },
        )

        ok(result != null, new Error(`The email ${email} was not found and could not be created`))

        return MongoEmailRepository.fromSchema(result)
    }

    findAll: (filters?: FindAllFilters) => Promise<EmailRecord[]> = async ({
        exists,
        format,
        domain,
        formatDefined,
    } = {}) => {
        const filters: Filter<EmailSchema> = {
            exists,
            domain,
        }

        if (formatDefined === true) {
            filters.format = {
                $exists: true,
            }
        }

        if (format !== undefined) {
            filters.format = format
        }

        return await this.collection
            .find(filters, { ignoreUndefined: true })
            .toArray()
            .then(entries => entries.map(MongoEmailRepository.fromSchema.bind(MongoEmailRepository)))
    }

    update = async (
        _id: string,
        { format, exists, lastVerificationId }: UpdateEmailRecord,
    ): Promise<EmailRecord | null> => {
        const updatedRecord = await this.collection.findOneAndUpdate(
            { _id },
            { $set: { format, exists, lastVerificationId } },
            { returnDocument: 'after' },
        )

        return updatedRecord != null ? MongoEmailRepository.fromSchema(updatedRecord) : null
    }

    delete: (_id: string) => Promise<EmailRecord | null> = async _id => {
        const deletedRecord = await this.collection.findOneAndDelete({ _id })
        return deletedRecord != null ? MongoEmailRepository.fromSchema(deletedRecord) : null
    }

    save: (createEmailRecord: CreateEmailRecord) => Promise<EmailRecord> = async ({
        email,
        exists,
        format,
        domain,
        username,
        lastVerificationId,
    }) => {
        const createdAt = new Date()

        const schema: EmailSchema = {
            _id: email,
            exists,
            format,
            domain,
            username,
            lastVerificationId,
            createdAt,
            updatedAt: createdAt,
        }

        try {
            await this.collection.insertOne(schema)
        } catch (error) {
            if (error instanceof MongoServerError) {
                if (error.code === MongoEmailRepository.ALREADY_EXISTS_ERROR_CODE) {
                    throw new Error(`The email ${email} already exists`)
                }
            }
        }

        return {
            email,
            exists,
            format,
            domain,
            username,
            lastVerificationId,
            createdAt,
            updatedAt: createdAt,
        }
    }

    findById: (id: string) => Promise<EmailRecord | null> = async _id => {
        const entry = await this.collection.findOne({ _id })
        return entry != null ? MongoEmailRepository.fromSchema(entry) : entry
    }
}
