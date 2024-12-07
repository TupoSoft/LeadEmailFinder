import type { Proxy, ProxyRepository } from './repository'
import { jest } from '@jest/globals'

export interface IProxyService {
    getAll: () => Promise<Proxy[]>
    create: (proxy: Proxy) => Promise<Proxy>
}

export class ProxyService implements IProxyService {
    constructor(private readonly proxyRepository: ProxyRepository) {}

    create: (proxy: Proxy) => Promise<Proxy> = async proxy => await this.proxyRepository.save(proxy)

    getAll: () => Promise<Proxy[]> = async () => await this.proxyRepository.getAll()
}

export class MockProxyService implements IProxyService {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MockProxyService.prototype.getAll>()
    create: (proxy: Proxy) => Promise<Proxy> = jest.fn<typeof MockProxyService.prototype.create>()
}
