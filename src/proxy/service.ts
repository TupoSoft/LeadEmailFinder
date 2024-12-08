import type { Proxy, ProxyRepository } from './repository'

export interface IProxyService {
    getAll: () => Promise<Proxy[]>
    create: (proxy: Proxy) => Promise<Proxy>
}

export class ProxyService implements IProxyService {
    constructor(private readonly proxyRepository: ProxyRepository) {}

    create: (proxy: Proxy) => Promise<Proxy> = async proxy => await this.proxyRepository.save(proxy)

    getAll: () => Promise<Proxy[]> = async () => await this.proxyRepository.getAll()
}
