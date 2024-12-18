import type { Proxy, ProxyRepository } from './repository'
import type { ProxyFvo } from './dto'

export interface IProxyService {
    getAll: () => Promise<Proxy[]>
    create: (proxy: ProxyFvo) => Promise<Proxy>
}

export class ProxyService implements IProxyService {
    constructor(private readonly proxyRepository: ProxyRepository) {}

    create: (proxy: ProxyFvo) => Promise<Proxy> = async proxy => await this.proxyRepository.save(proxy)

    getAll: () => Promise<Proxy[]> = async () => await this.proxyRepository.getAll()
}
