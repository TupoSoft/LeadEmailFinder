import type { Proxy, ProxyRepository } from './repository'
import type { ProxyFVO } from './dto'

export interface IProxyService {
    getAll: () => Promise<Proxy[]>
    create: (proxy: ProxyFVO) => Promise<Proxy>
}

export class ProxyService implements IProxyService {
    constructor(private readonly proxyRepository: ProxyRepository) {}

    create: (proxy: ProxyFVO) => Promise<Proxy> = async proxy => await this.proxyRepository.save(proxy)

    getAll: () => Promise<Proxy[]> = async () => await this.proxyRepository.getAll()
}
