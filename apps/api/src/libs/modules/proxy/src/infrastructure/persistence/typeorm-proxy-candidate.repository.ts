import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProxyCandidate, ProxyCandidateRepository } from '../../application/ports/proxy-candidate-repository'
import { ProxyLifecycle } from '../../domain/proxy-lifecycle'
import { toIProxy } from '../../domain/to-iproxy.mapper'
import { toProxyRecord } from './proxy-entity.mapper'
import { Proxy } from './proxy.entity'

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
        proxy: toIProxy(toProxyRecord(proxy)),
        weight: proxy.weight,
        maxConcurrent: proxy.maxConcurrent,
        requestsPerMinute: proxy.requestsPerMinute,
    }
}
