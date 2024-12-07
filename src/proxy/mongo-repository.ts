import { type Collection, type Db, ObjectId, type WithId } from 'mongodb'
import { generateObjectIdAsync } from '../util/mongo'
import type { Proxy, ProxyRepository } from './repository'

export type ProxySchema = WithId<Omit<Proxy, 'id'>>

function convertSchemaToEntity(proxySchema: ProxySchema): Proxy {
    const { _id, ...proxy } = proxySchema
    return { id: _id.toHexString(), ...proxy }
}

export class MongoProxyRepository implements ProxyRepository {
    private readonly collection: Collection<ProxySchema>

    constructor(db: Db) {
        this.collection = db.collection('proxy')
    }

    getAll: () => Promise<Proxy[]> = async () => {
        const proxies = await this.collection.find().toArray()

        return proxies.map(convertSchemaToEntity)
    }

    getById: (id: string) => Promise<Proxy | null> = async id => {
        const result = await this.collection.findOne({
            _id: new ObjectId(id),
        })

        return result != null ? convertSchemaToEntity(result) : result
    }

    save: (proxy: Proxy) => Promise<Proxy> = async (proxy: Proxy) => {
        const { insertedId } = await this.collection.insertOne({ ...proxy, _id: await generateObjectIdAsync() })
        return { id: insertedId.toHexString(), ...proxy }
    }

    update: (id: string, proxy: Partial<Proxy>) => Promise<Proxy | null> = async (id, proxy) => {
        const proxySchema = await this.collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: proxy },
            { returnDocument: 'after' },
        )

        return proxySchema != null ? convertSchemaToEntity(proxySchema) : proxySchema
    }
}
