import type { Proxy, ProxyRepository } from './repository'
import { jest } from '@jest/globals'
import type { MongoProxyRepository } from './mongo-repository'

export class MockProxyRepository implements ProxyRepository {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MongoProxyRepository.prototype.getAll>()
    getById: (id: string) => Promise<Proxy | null> = jest.fn<typeof MongoProxyRepository.prototype.getById>()
    save: (proxy: Proxy) => Promise<Proxy> = jest.fn<typeof MongoProxyRepository.prototype.save>()
    update: (id: string, proxy: Partial<Proxy>) => Promise<Proxy | null> =
        jest.fn<typeof MongoProxyRepository.prototype.update>()
}
