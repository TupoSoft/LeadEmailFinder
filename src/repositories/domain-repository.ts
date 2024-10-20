import type { MxRecord } from 'node:dns'
import type { Collection, Db } from 'mongodb'
import type { Domain, EmailFormat } from '../entities'

interface DomainSchema {
    _id: string
    catchAllEnabled?: boolean
    emailFormats: EmailFormat[]
    mxRecords?: MxRecord[]
    createdAt: Date
    updatedAt?: Date
}

export interface DomainRepository {
    save: (domain: Domain) => Promise<void>
    findByName: (name: string) => Promise<Domain>
}

export class DomainNotFoundError extends Error {
    name = 'DomainNotFoundError'

    constructor(domainName: string) {
        super(`The domain ${domainName} wasn't found in the database!`)
    }
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

export class MongoDomainRepository implements DomainRepository {
    private readonly collection: Collection<DomainSchema>

    constructor(db: Db) {
        this.collection = db.collection('domains')
    }

    async findByName(name: string): Promise<Domain> {
        const domainSchema = await this.collection.findOne({ name })
        if (domainSchema === null) throw new DomainNotFoundError(name)
        return domainSchemaToDomainEntity(domainSchema)
    }

    async save(domain: Domain): Promise<void> {
        const domainSchema = domainEntityToDomainSchema(domain)
        await this.collection.updateOne({ _id: domain.name }, { $set: domainSchema }, { upsert: true })
    }
}
