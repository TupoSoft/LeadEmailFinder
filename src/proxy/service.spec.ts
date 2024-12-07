import { describe, expect, it, jest } from '@jest/globals'
import { ProxyService } from './service'
import type { Proxy, ProxyRepository } from './repository'
import type { MongoProxyRepository } from './mongo-repository'

export class MockProxyRepository implements ProxyRepository {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MongoProxyRepository.prototype.getAll>()
    getById: (id: string) => Promise<Proxy | null> = jest.fn<typeof MongoProxyRepository.prototype.getById>()
    save: (proxy: Proxy) => Promise<Proxy> = jest.fn<typeof MongoProxyRepository.prototype.save>()
    update: (id: string, proxy: Partial<Proxy>) => Promise<Proxy | null> =
        jest.fn<typeof MongoProxyRepository.prototype.update>()
}

describe('ProxyService', () => {
    const proxyRepository = new MockProxyRepository() as jest.Mocked<MockProxyRepository>
    const proxyService = new ProxyService(proxyRepository)

    const proxy: Proxy = {
        id: '1',
        type: 'socks5',
        host: 'example.com',
        port: 3333,
        user: 'foo',
        password: 'bar',
    }

    describe('getAll', () => {
        it('should return all proxies', async () => {
            const proxies = [proxy]
            proxyRepository.getAll.mockResolvedValueOnce(proxies)
            await expect(proxyService.getAll()).resolves.toEqual(proxies)
        })

        it('should create a new proxy', async () => {
            proxyRepository.save.mockResolvedValueOnce(proxy)
            await expect(proxyService.create(proxy)).resolves.toBe(proxy)
        })
    })
})
