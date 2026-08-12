import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IProxy } from '@tuposoft/lead-email-finder/common'
import { Repository } from 'typeorm'
import { ProxyLifecycle, ProxyProtocol } from './proxy.dto'
import { Proxy } from './proxy.entity'
import { ProxyLease, ProxyLeaseService } from './proxy-lease.service'

const PROTOCOL_TO_TYPE: Record<ProxyProtocol, IProxy['type']> = {
    [ProxyProtocol.HTTP]: 'http',
    [ProxyProtocol.HTTPS]: 'https',
    [ProxyProtocol.SOCKS4]: 'socks4',
    [ProxyProtocol.SOCKS5]: 'socks5',
}

export interface LeasedProxy {
    proxy: IProxy
    lease: ProxyLease
}

@Injectable()
export class ProxyAllocatorService {
    constructor(
        @InjectRepository(Proxy) private readonly proxyRepo: Repository<Proxy>,
        private readonly proxyLeaseService: ProxyLeaseService,
    ) {}

    async acquire(mxHost: string, proxyId?: string, excludedProxyIds: string[] = []): Promise<LeasedProxy | undefined> {
        const candidates = proxyId == null
            ? await this.getEligibleProxies(mxHost, excludedProxyIds)
            : await this.getExplicitProxy(mxHost, proxyId, excludedProxyIds)

        for (const proxy of orderByWeight(candidates)) {
            const lease = await this.proxyLeaseService.acquire({
                proxyId: proxy.id,
                mxHost,
                maxConcurrent: proxy.maxConcurrent,
                requestsPerMinute: proxy.requestsPerMinute,
            })

            if (lease !== undefined) {
                return { proxy: mapProxy(proxy), lease }
            }
        }

        return undefined
    }

    async release({ lease }: LeasedProxy): Promise<boolean> {
        return await this.proxyLeaseService.release(lease)
    }

    private async getEligibleProxies(mxHost: string, excludedProxyIds: string[]): Promise<Proxy[]> {
        const query = this.proxyRepo
            .createQueryBuilder('proxy')
            .where('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            .andWhere('(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))', { mxHost })

        if (excludedProxyIds.length > 0) {
            query.andWhere('proxy.id NOT IN (:...excludedProxyIds)', { excludedProxyIds })
        }

        return await query.getMany()
    }

    private async getExplicitProxy(mxHost: string, proxyId: string, excludedProxyIds: string[]): Promise<Proxy[]> {
        if (excludedProxyIds.includes(proxyId)) {
            return []
        }

        const proxy = await this.proxyRepo.findOneBy({ id: proxyId, state: ProxyLifecycle.ACTIVE })

        if (proxy === null || proxy.blacklists?.includes(mxHost)) {
            return []
        }

        return [proxy]
    }
}

function orderByWeight(proxies: Proxy[]): Proxy[] {
    const remaining = [...proxies]
    const ordered: Proxy[] = []

    while (remaining.length > 0) {
        const totalWeight = remaining.reduce((sum, proxy) => sum + Math.max(proxy.weight, 0), 0)
        const selected = selectWeightedProxy(remaining, totalWeight)

        ordered.push(selected)
        remaining.splice(remaining.indexOf(selected), 1)
    }

    return ordered
}

function selectWeightedProxy(proxies: Proxy[], totalWeight: number): Proxy {
    if (totalWeight <= 0) {
        return proxies[0]
    }

    let threshold = Math.random() * totalWeight

    for (const proxy of proxies) {
        threshold -= Math.max(proxy.weight, 0)

        if (threshold < 0) {
            return proxy
        }
    }

    return proxies.at(-1)!
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
