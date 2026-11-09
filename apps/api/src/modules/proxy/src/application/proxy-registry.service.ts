import { IProxy } from '../domain/proxy.interface'
import { IProxyService } from '../domain/proxy-service.interface'
import { toIProxy } from '../domain/to-iproxy.mapper'
import { ProxyRepository } from './ports/proxy-repository'
import { ProxyNotFoundError } from './proxy-not-found.error'

export class ProxyRegistryService implements IProxyService {
    constructor(private readonly repository: ProxyRepository) {}

    async get(excludedExchanges?: string[]): Promise<IProxy[]> {
        const proxies = excludedExchanges?.length
            ? await this.repository.findActiveExcluding(excludedExchanges)
            : await this.repository.findAllActive()

        return proxies.map(toIProxy)
    }

    async getById(id: string): Promise<IProxy> {
        const proxy = await this.repository.findById(id)

        if (proxy === undefined) {
            throw new ProxyNotFoundError(id)
        }

        return toIProxy(proxy)
    }

    async addToBlacklist(id: string, blacklist: string): Promise<IProxy> {
        const updated = await this.repository.addBlacklist(id, blacklist)

        if (updated === undefined) {
            throw new ProxyNotFoundError(id)
        }

        return toIProxy(updated)
    }
}
