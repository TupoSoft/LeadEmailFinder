import type { Collection, Db } from 'mongodb'
import type { Domain } from './entity'

type DomainSchema = Omit<Domain, 'name'> & {
    _id: string
}

export interface DomainRepository {
    save: (domain: Domain) => Promise<void>
    findByName: (name: string) => Promise<Domain>
}

function domainEntityToDomainSchema(domain: Domain): DomainSchema {
    const { name: _id, ...domainSchema } = domain

    return { _id, ...domainSchema }
}

function domainSchemaToDomainEntity(domainSchema: DomainSchema): Domain {
    const { _id: name, ...domain } = domainSchema

    return { name, ...domain }
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
