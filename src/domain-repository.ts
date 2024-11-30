import type { MxRecord } from 'node:dns'
import type { Collection, Db } from 'mongodb'
import type { Domain } from './entities'
import type { EmailPatternUsage } from './find-lead'

interface DomainSchema {
    _id: string
    catchAllEnabled?: boolean
    emailPatternUsage: EmailPatternUsage[]
    mxRecords?: MxRecord[]
    createdAt?: Date
    updatedAt?: Date
}

export interface DomainRepository {
    save: (domain: Domain) => Promise<void>
    findByName: (name: string) => Promise<Domain>
    incrementEmailFormat: (name: string, format: string) => Promise<void>
}

function domainEntityToDomainSchema(domain: Domain): DomainSchema {
    const { name: _id, ...domainSchema } = domain

    return {
        _id,
        ...domainSchema,
    }
}

function domainSchemaToDomainEntity(domainSchema: DomainSchema): Domain {
    const { _id: name, ...domain } = domainSchema

    return {
        name,
        ...domain,
    }
}

export class DomainNotFoundError extends Error {
    constructor(name: string) {
        super(`The domain name ${name} doesn't exist`)
    }
}

export class MongoDomainRepository implements DomainRepository {
    private readonly collection: Collection<DomainSchema>

    constructor(db: Db) {
        this.collection = db.collection('domains')
    }

    incrementEmailFormat: (name: string, format: string) => Promise<void> = async (
        name: string,
        pattern: string,
    ): Promise<void> => {
        const { matchedCount, modifiedCount } = await this.collection.updateOne(
            { _id: name },
            { $inc: { 'emailPatternUsage.$[element].usageCount': 1 } },
            { arrayFilters: [{ 'element.pattern': pattern }], upsert: true },
        )

        if (matchedCount === 0 || modifiedCount === 0) {
            await this.collection.updateOne(
                { _id: name },
                {
                    $push: {
                        emailPatternUsage: { pattern, usageCount: 1 },
                    },
                },
            )
        }
    }

    async findByName(name: string): Promise<Domain> {
        const domainSchema = await this.collection.findOne({ _id: name })
        if (domainSchema === null) throw new DomainNotFoundError(name)
        return domainSchemaToDomainEntity(domainSchema)
    }

    async save(domain: Domain): Promise<void> {
        const { _id, ...domainSchema } = domainEntityToDomainSchema(domain)
        await this.collection.updateOne(
            { _id },
            {
                $set: { ...domainSchema, updatedAt: new Date() },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true },
        )
    }
}
