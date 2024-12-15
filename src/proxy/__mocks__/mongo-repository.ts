import type { Proxy, ProxyRepository } from '../repository'
import type { ProxyFvo, ProxyMvo } from '../dto'
import { jest } from '@jest/globals'

export class MongoProxyRepository implements ProxyRepository {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MongoProxyRepository.prototype.getAll>()
    getById: (id: string) => Promise<Proxy | null> = jest.fn<typeof MongoProxyRepository.prototype.getById>()
    save: (proxy: ProxyFvo) => Promise<Proxy> = jest.fn<typeof MongoProxyRepository.prototype.save>()
    update: (id: string, proxy: ProxyMvo) => Promise<Proxy | null> =
        jest.fn<typeof MongoProxyRepository.prototype.update>()
}
