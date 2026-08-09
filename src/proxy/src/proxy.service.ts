import { BadRequestException, Injectable } from '@nestjs/common'
import {
    AddProxyRequest,
    AddProxyResponse,
    DeleteProxyRequest,
    DeleteProxyResponse,
    GetHealthyProxyRequest,
    GetHealthyProxyResponse,
    GetProxyRequest,
    GetProxyResponse,
    ListProxiesRequest,
    ListProxiesResponse,
    ProxyServiceController,
    ReportProxyBlacklistRequest,
    ReportProxyBlacklistResponse,
    UpdateProxyRequest,
    UpdateProxyResponse,
} from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { CommandBus } from '@nestjs/cqrs'
import { AddProxyCommand } from './add-proxy/add-proxy.command'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from './proxy.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, MoreThan, Repository } from 'typeorm'
import { isUUID } from 'class-validator'
import { Proxy } from './proxy.entity'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100
const WRITABLE_PROXY_FIELDS = ['protocol', 'host', 'port', 'auth', 'weight', 'description', 'enabled'] as const
type WritableProxyField = (typeof WRITABLE_PROXY_FIELDS)[number]

@Injectable()
export class ProxyService implements ProxyServiceController {
    constructor(
        private readonly commandBus: CommandBus,
        @InjectRepository(Proxy, 'proxy') private readonly proxyRepo: Repository<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async getProxy({ id }: GetProxyRequest): Promise<GetProxyResponse> {
        if (!isUUID(id)) {
            throw new ProxyNotFoundException(id)
        }

        const proxy = await this.proxyRepo.findOneBy({ id })

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        return {
            proxy: this.mapper.map(proxy, Proxy, ProxyDescriptorDto),
        }
    }

    async addProxy({
        protocol,
        host,
        port,
        auth,
        weight,
        enabled,
        description,
    }: AddProxyRequest): Promise<AddProxyResponse> {
        return await this.commandBus.execute(
            new AddProxyCommand(protocol, host, port, auth, description, weight, enabled),
        )
    }

    async listProxies({ pageSize, pageToken }: ListProxiesRequest): Promise<ListProxiesResponse> {
        const resolvedPageSize = Math.min(Math.max(pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
        const where: FindOptionsWhere<Proxy> = {}

        if (pageToken !== undefined) {
            if (!isUUID(pageToken)) {
                throw new BadRequestException('Invalid page token.')
            }

            where.id = MoreThan(pageToken)
        }

        const proxies = await this.proxyRepo.find({
            where,
            order: { id: 'ASC' },
            take: resolvedPageSize + 1,
        })
        const hasNextPage = proxies.length > resolvedPageSize
        const page = hasNextPage ? proxies.slice(0, resolvedPageSize) : proxies

        return {
            proxies: this.mapper.mapArray(page, Proxy, ProxyDescriptorDto),
            nextPageToken: hasNextPage ? page.at(-1)!.id : '',
        }
    }

    async updateProxy({ updateMask, proxy }: UpdateProxyRequest): Promise<UpdateProxyResponse> {
        if (proxy === undefined || !isUUID(proxy.id)) {
            throw new BadRequestException('A proxy with a valid id is required.')
        }

        const fields = updateMask ?? []

        if (fields.length === 0 || fields.some(field => !isWritableProxyField(field))) {
            throw new BadRequestException('updateMask must contain one or more writable proxy fields.')
        }

        const updateFields = fields as WritableProxyField[]

        const entity = await this.proxyRepo.findOneBy({ id: proxy.id })

        if (entity === null) {
            throw new ProxyNotFoundException(proxy.id)
        }

        const updates = Object.fromEntries(updateFields.map(field => [field, proxy[field]])) as Partial<Pick<Proxy, WritableProxyField>>
        Object.assign(entity, updates)

        const updated = await this.proxyRepo.save(entity)

        return { proxy: this.mapper.map(updated, Proxy, ProxyDescriptorDto) }
    }

    async deleteProxy({ id }: DeleteProxyRequest): Promise<DeleteProxyResponse> {
        if (!isUUID(id)) {
            throw new ProxyNotFoundException(id)
        }

        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            throw new ProxyNotFoundException(id)
        }

        await this.proxyRepo.remove(entity)

        return { proxy: this.mapper.map(entity, Proxy, ProxyDescriptorDto) }
    }

    async getHealthyProxy({ mxHost }: GetHealthyProxyRequest): Promise<GetHealthyProxyResponse> {
        const proxies = await this.proxyRepo
            .createQueryBuilder('proxy')
            .where('proxy.enabled = :enabled', { enabled: true })
            .andWhere('(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))', { mxHost })
            .getMany()

        const totalWeight = proxies.reduce((sum, proxy) => sum + Math.max(proxy.weight, 0), 0)
        const selected = selectWeightedProxy(proxies, totalWeight)

        return { proxy: selected === undefined ? undefined : this.mapper.map(selected, Proxy, ProxyDescriptorDto) }
    }

    async reportProxyBlacklist({ id, mxHost }: ReportProxyBlacklistRequest): Promise<ReportProxyBlacklistResponse> {
        if (!isUUID(id)) {
            throw new ProxyNotFoundException(id)
        }

        const entity = await this.proxyRepo.findOneBy({ id })

        if (entity === null) {
            throw new ProxyNotFoundException(id)
        }

        entity.blacklists = [...new Set([...(entity.blacklists ?? []), mxHost])]
        await this.proxyRepo.save(entity)

        return {}
    }

    getHello(): string {
        return 'Hello World!'
    }
}

function selectWeightedProxy(proxies: Proxy[], totalWeight: number): Proxy | undefined {
    if (proxies.length === 0) {
        return undefined
    }

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

    return proxies.at(-1)
}

function isWritableProxyField(field: string): field is WritableProxyField {
    return (WRITABLE_PROXY_FIELDS as readonly string[]).includes(field)
}
