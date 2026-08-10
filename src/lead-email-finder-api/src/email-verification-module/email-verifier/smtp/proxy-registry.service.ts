import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { IProxy, IProxyService } from '@tuposoft/lead-email-finder/common'
import { Proxy } from '../../../../../proxy/src/proxy.entity'
import { ProxyProtocol } from '../../../../../proxy/src/proxy.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'

const PROTOCOL_TO_TYPE: Record<ProxyProtocol, IProxy['type']> = {
    [ProxyProtocol.HTTP]: 'http',
    [ProxyProtocol.HTTPS]: 'https',
    [ProxyProtocol.SOCKS4]: 'socks4',
    [ProxyProtocol.SOCKS5]: 'socks5',
}

@Injectable()
export class ProxyRegistryService implements IProxyService {
    constructor(@InjectRepository(Proxy) private readonly proxyRepo: Repository<Proxy>) {}

    async get(excludedExchanges?: string[]): Promise<IProxy[]> {
        let proxies: Proxy[]

        if (excludedExchanges?.length) {
            proxies = await this.proxyRepo
                .createQueryBuilder('proxy')
                .where('proxy.enabled = :enabled', { enabled: true })
                .andWhere('proxy.blacklists IS NULL OR NOT (proxy.blacklists && ARRAY[:...exchanges])', {
                    exchanges: excludedExchanges,
                })
                .getMany()
        } else {
            proxies = await this.proxyRepo.findBy({ enabled: true })
        }

        return proxies.map(mapProxy)
    }

    async getById(id: string): Promise<IProxy> {
        const proxy = await this.proxyRepo.findOneBy({ id })

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        return mapProxy(proxy)
    }

    async addToBlacklist(id: string, blacklist: string): Promise<IProxy> {
        const proxy = await this.proxyRepo.findOneBy({ id })

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        proxy.blacklists = [...new Set([...(proxy.blacklists ?? []), blacklist])]
        return mapProxy(await this.proxyRepo.save(proxy))
    }
}

function mapProxy(proxy: Proxy): IProxy {
    return {
        id: proxy.id,
        type: PROTOCOL_TO_TYPE[proxy.protocol],
        host: proxy.host,
        port: proxy.port,
        user: proxy.auth?.user,
        password: proxy.auth?.pass,
        blacklists: proxy.blacklists,
    }
}
