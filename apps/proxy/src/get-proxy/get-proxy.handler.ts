import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GetProxyCommand } from './get-proxy.command'
import { GetProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { InjectModel } from '@nestjs/mongoose'
import { Proxy } from '../proxy.schema'
import { Model } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'
import { ProxyNotFoundException } from '../proxy-not-found.exception'
import { Inject, Logger, Optional } from '@nestjs/common'
import { isNativeError } from 'node:util/types'

@CommandHandler(GetProxyCommand)
export class GetProxyHandler implements ICommandHandler<GetProxyCommand> {
    constructor(
        @InjectModel(Proxy.name, 'proxy') private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
        @Inject()
        @Optional()
        private readonly logger = new Logger(GetProxyHandler.name),
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute({ id: _id }: GetProxyCommand): Promise<GetProxyResponse> {
        const proxy = await this.getProxyById(_id)

        if (proxy === null) {
            throw new ProxyNotFoundException(_id)
        }

        const proxyDescriptor = this.mapper.map(proxy, Proxy, ProxyDescriptorDto)

        return {
            proxy: proxyDescriptor,
        }
    }

    private async getProxyById(_id: string): Promise<Proxy | null> {
        try {
            return await this.proxyModel.findOne({ _id })
        } catch (error) {
            if (isNativeError(error)) {
                this.logger.error(error.message)
            }

            throw new ProxyNotFoundException(_id)
        }
    }
}
