import { ProxyRecord } from '../../domain/proxy-record'
import { Proxy } from './proxy.entity'

export function toProxyRecord(entity: Proxy): ProxyRecord {
    return {
        id: entity.id,
        protocol: entity.protocol,
        host: entity.host,
        port: entity.port,
        auth: entity.auth,
        state: entity.state,
        weight: entity.weight,
        maxConcurrent: entity.maxConcurrent,
        requestsPerMinute: entity.requestsPerMinute,
        description: entity.description,
        blacklists: entity.blacklists,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}
