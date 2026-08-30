import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isUUID } from 'class-validator'
import { FindOptionsWhere, MoreThan, Repository } from 'typeorm'
import { CreateProxyFields, ProxyFieldUpdates, ProxyRepository } from '../../application/ports/proxy-repository'
import { ProxyLifecycle } from '../../domain/proxy-lifecycle'
import { ProxyRecord } from '../../domain/proxy-record'
import { toProxyRecord } from './proxy-entity.mapper'
import { Proxy } from './proxy.entity'

@Injectable()
export class TypeOrmProxyRepository implements ProxyRepository {
    constructor(@InjectRepository(Proxy) private readonly proxyRepo: Repository<Proxy>) {}

    async create(fields: CreateProxyFields): Promise<ProxyRecord> {
        const proxy = await this.proxyRepo.save(this.proxyRepo.create(fields))
        return toProxyRecord(proxy)
    }

    async findById(id: string): Promise<ProxyRecord | undefined> {
        if (!isUUID(id)) {
            return undefined
        }

        const proxy = await this.proxyRepo.findOneBy({ id })
        return proxy === null ? undefined : toProxyRecord(proxy)
    }

    async list(take: number, afterId: string | undefined): Promise<ProxyRecord[]> {
        const where: FindOptionsWhere<Proxy> = {}

        if (afterId !== undefined) {
            where.id = MoreThan(afterId)
        }

        const proxies = await this.proxyRepo.find({ where, order: { id: 'ASC' }, take })
        return proxies.map(toProxyRecord)
    }

    async update(id: string, fields: ProxyFieldUpdates): Promise<ProxyRecord | undefined> {
        if (!isUUID(id)) {
            return undefined
        }

        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            return undefined
        }

        Object.assign(entity, fields)
        const updated = await this.proxyRepo.save(entity)

        return toProxyRecord(updated)
    }

    async delete(id: string): Promise<ProxyRecord | undefined> {
        if (!isUUID(id)) {
            return undefined
        }

        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            return undefined
        }

        const record = toProxyRecord(entity)
        await this.proxyRepo.remove(entity)

        return record
    }

    async addBlacklist(id: string, mxHost: string): Promise<ProxyRecord | undefined> {
        if (!isUUID(id)) {
            return undefined
        }

        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            return undefined
        }

        entity.blacklists = [...new Set([...(entity.blacklists ?? []), mxHost])]
        const updated = await this.proxyRepo.save(entity)

        return toProxyRecord(updated)
    }

    async findActiveNotBlacklistedFor(mxHost: string): Promise<ProxyRecord[]> {
        const proxies = await this.proxyRepo
            .createQueryBuilder('proxy')
            .where('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            .andWhere('(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))', { mxHost })
            .getMany()

        return proxies.map(toProxyRecord)
    }

    async findAllActive(): Promise<ProxyRecord[]> {
        const proxies = await this.proxyRepo.findBy({ state: ProxyLifecycle.ACTIVE })
        return proxies.map(toProxyRecord)
    }

    async findActiveExcluding(excludedExchanges: readonly string[]): Promise<ProxyRecord[]> {
        const proxies = await this.proxyRepo
            .createQueryBuilder('proxy')
            .where('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
            .andWhere('proxy.blacklists IS NULL OR NOT (proxy.blacklists && ARRAY[:...exchanges])', {
                exchanges: excludedExchanges,
            })
            .getMany()

        return proxies.map(toProxyRecord)
    }
}
