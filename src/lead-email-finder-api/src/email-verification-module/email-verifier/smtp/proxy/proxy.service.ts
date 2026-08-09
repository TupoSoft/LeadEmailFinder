import { Injectable } from '@nestjs/common'
import { Proxy } from './proxy.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, Repository } from 'typeorm'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ICreateProxyDto, IProxy, IProxyService, IUpdateProxyDto } from '@tuposoft/lead-email-finder/common'
import { ProxyResponse } from './proxy-response.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'

@Injectable()
export class ProxyService implements IProxyService {
    constructor(
        @InjectRepository(Proxy) private readonly proxyRepo: Repository<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async create(createProxyDto: ICreateProxyDto): Promise<IProxy> {
        const created = await this.proxyRepo.save(this.proxyRepo.create(createProxyDto as DeepPartial<Proxy>))
        return this.mapper.map(created, Proxy, ProxyResponse)
    }

    async update(id: string, updateProxyDto: IUpdateProxyDto): Promise<IProxy> {
        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            throw new ProxyNotFoundException(id)
        }

        Object.assign(entity, updateProxyDto)
        const updated = await this.proxyRepo.save(entity)

        return this.mapper.map(updated, Proxy, ProxyResponse)
    }

    async remove(id: string): Promise<IProxy> {
        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            throw new ProxyNotFoundException(id)
        }

        await this.proxyRepo.remove(entity)

        return this.mapper.map(entity, Proxy, ProxyResponse)
    }

    async addToBlacklist(id: string, blacklist: string): Promise<IProxy> {
        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            throw new ProxyNotFoundException(id)
        }

        entity.blacklists = [...new Set([...(entity.blacklists ?? []), blacklist])]
        const updated = await this.proxyRepo.save(entity)

        return this.mapper.map(updated, Proxy, ProxyResponse)
    }

    async getById(id: string): Promise<IProxy> {
        const proxy = await this.proxyRepo.findOneBy({ id })

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        return this.mapper.map(proxy, Proxy, ProxyResponse)
    }

    async get(excludedExchanges?: string[]): Promise<IProxy[]> {
        let proxies: Proxy[]

        if (excludedExchanges?.length) {
            proxies = await this.proxyRepo
                .createQueryBuilder('p')
                .where('p.blacklists IS NULL OR NOT (p.blacklists && ARRAY[:...exchanges])', {
                    exchanges: excludedExchanges,
                })
                .getMany()
        } else {
            proxies = await this.proxyRepo.find()
        }

        return this.mapper.mapArray(proxies, Proxy, ProxyResponse)
    }
}
