import { type Collection, type Db, type Filter, ObjectId, type UpdateFilter, type WithId } from 'mongodb'
import type { ProxyFvo, ProxyMvo } from './dto'
import type { GetAllFilter, Proxy, ProxyRepository } from './repository'

export type ProxySchema = Omit<Proxy, 'id'>

export class MongoProxyRepository implements ProxyRepository {
    private readonly collection: Collection<ProxySchema>

    constructor(db: Db) {
        this.collection = db.collection('proxy')
    }

    private static fromSchema({ host, type, blacklists, password, port, user, _id }: WithId<ProxySchema>): Proxy {
        return {
            id: _id.toHexString(),
            host,
            type,
            blacklists,
            password,
            port,
            user,
        }
    }

    getAll = async ({ blacklistsExclude = [] }: GetAllFilter = {}): Promise<Proxy[]> => {
        const filter: Filter<ProxySchema> = {
            blacklists: {
                $nin: blacklistsExclude,
            },
        }

        const proxies = await this.collection.find(filter).toArray()
        return proxies.map(MongoProxyRepository.fromSchema.bind(MongoProxyRepository))
    }

    getById = async (id: string): Promise<Proxy | null> => {
        const result = await this.collection.findOne({
            _id: new ObjectId(id),
        })

        return result != null ? MongoProxyRepository.fromSchema(result) : result
    }

    create = async ({ type, password, port, user, host }: ProxyFvo): Promise<Proxy> => {
        const { insertedId } = await this.collection.insertOne({ type, user, host, port, password })
        return { id: insertedId.toHexString(), type, user, host, port, password }
    }

    update = async (
        id: string,
        { host, type, user, port, password, blacklistsToAdd, blacklistsToRemove }: ProxyMvo,
    ): Promise<Proxy | null> => {
        const updateFilter: UpdateFilter<ProxySchema> = {
            $set: {
                host,
                type,
                user,
                port,
                password,
            },
        }

        if (blacklistsToAdd != null) {
            updateFilter.$addToSet = {
                blacklists: { $each: blacklistsToAdd },
            }
        }

        if (blacklistsToRemove != null) {
            updateFilter.$pullAll = {
                blacklists: blacklistsToRemove,
            }
        }

        const proxySchema = await this.collection.findOneAndUpdate({ _id: new ObjectId(id) }, updateFilter, {
            returnDocument: 'after',
            ignoreUndefined: true,
        })

        return proxySchema != null ? MongoProxyRepository.fromSchema(proxySchema) : proxySchema
    }
}
