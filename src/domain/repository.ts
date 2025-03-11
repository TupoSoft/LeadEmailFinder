import type { Collection, Db } from 'mongodb'
import type { Domain } from './entity'
import type { MxRecord } from 'node:dns'

interface DomainSchema {
    _id: string
    catchAllEnabled: boolean
    isFree: boolean
    isDisposable: boolean
    isVerificationForbidden: boolean
    mxRecords: MxRecord[]
    createdAt: Date
    updatedAt: Date
}

export interface CreateDomainDto {
    name: string
    catchAllEnabled: boolean
    mxRecords: MxRecord[]
    isFree: boolean
    isDisposable: boolean
    isVerificationForbidden: boolean
}

export interface UpdateDomainDto {
    catchAllEnabled?: boolean
    mxRecords?: MxRecord[]
    isFree?: boolean
    isDisposable?: boolean
    isVerificationForbidden?: boolean
}

export interface DomainRepository {
    create: (domain: CreateDomainDto) => Promise<Domain>
    update: (name: string, domain: UpdateDomainDto) => Promise<Domain | null>
    findById: (name: string) => Promise<Domain | null>
}

export class MongoDomainRepository implements DomainRepository {
    private readonly collection: Collection<DomainSchema>

    constructor(db: Db) {
        this.collection = db.collection('domains')
    }

    private static fromDomainSchema({
        _id,
        isVerificationForbidden,
        isDisposable,
        catchAllEnabled,
        mxRecords,
        createdAt,
        updatedAt,
        isFree,
    }: DomainSchema): Domain {
        return {
            name: _id,
            isFree,
            isVerificationForbidden,
            isDisposable,
            catchAllEnabled,
            mxRecords,
            createdAt,
            updatedAt,
        }
    }

    update: (name: string, domain: UpdateDomainDto) => Promise<Domain | null> = async (
        name,
        { isVerificationForbidden, isDisposable, catchAllEnabled, mxRecords, isFree },
    ): Promise<Domain | null> => {
        const updateFilter = {
            $set: {
                isVerificationForbidden,
                isDisposable,
                catchAllEnabled,
                mxRecords,
                isFree,
                updatedAt: new Date(),
            },
        }

        const domainSchema = await this.collection.findOneAndUpdate({ _id: name }, updateFilter, {
            returnDocument: 'after',
            ignoreUndefined: true,
        })

        return domainSchema != null ? MongoDomainRepository.fromDomainSchema(domainSchema) : null
    }

    async findById(name: string): Promise<Domain | null> {
        const domainSchema = await this.collection.findOne({ _id: name })
        if (domainSchema === null) return domainSchema
        return MongoDomainRepository.fromDomainSchema(domainSchema)
    }

    async create({
        name,
        isFree,
        isVerificationForbidden,
        isDisposable,
        catchAllEnabled,
        mxRecords,
    }: CreateDomainDto): Promise<Domain> {
        const createdAt = new Date()
        const updatedAt = createdAt

        await this.collection.insertOne({
            _id: name,
            isFree,
            isVerificationForbidden,
            isDisposable,
            catchAllEnabled,
            mxRecords,
            createdAt,
            updatedAt,
        })

        return {
            name,
            isFree,
            isVerificationForbidden,
            isDisposable,
            mxRecords,
            createdAt,
            updatedAt,
            catchAllEnabled,
        }
    }
}
