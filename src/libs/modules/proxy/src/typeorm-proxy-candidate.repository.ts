import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IProxy } from '@tuposoft/lead-email-finder/common'
import { Repository } from 'typeorm'
import { ProxyLifecycle, ProxyProtocol } from './proxy.dto'
import { Proxy } from './proxy.entity'
import { ProxyCandidate, ProxyCandidateRepository } from './proxy-candidate.repository'

const PROTOCOL_TO_TYPE: Record<ProxyProtocol, IProxy['type']> = {
    [ProxyProtocol.HTTP]: 'http',
    [ProxyProtocol.HTTPS]: 'https',
    [ProxyProtocol.SOCKS4]: 'socks4',
    [ProxyProtocol.SOCKS5]: 'socks5',
}

@Injectable()
export class TypeOrmProxyCandidateRepository implements ProxyCandidateRepository {
    constructor(@InjectRepository(Proxy) private readonly proxyRepo: Repository<Proxy>) {}

    async findEligible(mxHost: string, excludedProxyIds: string[]): Promise<ProxyCandidate[]> {
        const query = this.proxyRepo
            .createQueryBuilder('proxy')
            .where('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            .andWhere('(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))', { mxHost })

        if (excludedProxyIds.length > 0) {
            query.andWhere('proxy.id NOT IN (:...excludedProxyIds)', { excludedProxyIds })
        }

        return (await query.getMany()).map(mapCandidate)
    }

    async findActiveById(mxHost: string, proxyId: string): Promise<ProxyCandidate | undefined> {
        const proxy = await this.proxyRepo.findOneBy({ id: proxyId, state: ProxyLifecycle.ACTIVE })

        if (proxy === null || proxy.blacklists?.includes(mxHost)) {
            return undefined
        }

        return mapCandidate(proxy)
    }
}

function mapCandidate(proxy: Proxy): ProxyCandidate {
    return {
        proxy: {
            id: proxy.id,
            type: PROTOCOL_TO_TYPE[proxy.protocol],
            host: proxy.host,
            port: proxy.port,
            user: proxy.auth?.user,
            password: proxy.auth?.pass,
            blacklists: proxy.blacklists,
        },
        weight: proxy.weight,
        maxConcurrent: proxy.maxConcurrent,
        requestsPerMinute: proxy.requestsPerMinute,
    }
}
