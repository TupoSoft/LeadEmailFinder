import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ListProxiesQuery } from '../queries/list-proxies.query'
import { ListProxiesResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { InjectModel } from '@nestjs/mongoose'
import { Proxy } from '../proxy.schema'
import { Model } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { Logger, Optional } from '@nestjs/common'
import { ProxyDescriptorDto } from '../proxy.dto'

@QueryHandler(ListProxiesQuery)
export class ListProxiesHandler implements IQueryHandler<ListProxiesQuery> {
    constructor(
        @InjectModel(Proxy.name, 'proxy') private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
        @Optional() private readonly logger: Logger = new Logger(ListProxiesHandler.name),
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute({ pageToken, pageSize }: ListProxiesQuery): Promise<ListProxiesResponse> {
        const documents = await this.proxyModel
            .find({ _id: { $gt: pageToken } })
            .limit(pageSize + 1)
            .lean()
            .exec()

        let nextPageToken = ''

        if (documents.length > pageSize) {
            const next = documents.pop()
            nextPageToken = next?._id.toHexString() ?? ''
        }

        const proxies = this.mapper.mapArray(documents, Proxy, ProxyDescriptorDto)

        return {
            proxies,
            nextPageToken,
        }
    }
}
