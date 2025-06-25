import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetProxyQuery } from '../queries/get-proxy.query'
import { GetProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { InjectModel } from '@nestjs/mongoose'
import { Proxy } from '../proxy.schema'
import { Model } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'
import { ProxyNotFoundException } from '../proxy-not-found.exception'
import { isNativeError } from 'node:util/types'
import { Logger, Optional } from '@nestjs/common'

@QueryHandler(GetProxyQuery)
export class GetProxyHandler implements IQueryHandler<GetProxyQuery> {
    constructor(
        @InjectModel(Proxy.name, 'proxy') private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
        @Optional() private readonly logger: Logger = new Logger(GetProxyHandler.name),
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute({ id }: GetProxyQuery): Promise<GetProxyResponse> {
        const document = await this.findOne(id)

        if (document === null) {
            throw new ProxyNotFoundException(id)
        }

        const proxy = this.mapper.map(document, Proxy, ProxyDescriptorDto)

        return {
            proxy,
        }
    }

    private async findOne(id: string): Promise<Proxy | null> {
        try {
            return await this.proxyModel.findOne({ _id: id })
        } catch (e) {
            if (isNativeError(e)) {
                this.logger.error(e.message, e.stack)

                throw new ProxyNotFoundException(id)
            }

            throw e
        }
    }
}
