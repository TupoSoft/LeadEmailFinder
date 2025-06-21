import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GetProxyCommand } from './get-proxy.command'
import { GetProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { InjectModel } from '@nestjs/mongoose'
import { Proxy } from '../proxy.schema'
import { Model } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'

@CommandHandler(GetProxyCommand)
export class GetProxyHandler implements ICommandHandler<GetProxyCommand> {
    constructor(
        @InjectModel(Proxy.name, 'proxy') private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute({ id }: GetProxyCommand): Promise<GetProxyResponse> {
        const proxy = await this.proxyModel.findOne({ _id: id })
        const proxyDescriptor = this.mapper.map(proxy, Proxy, ProxyDescriptorDto)

        return {
            proxy: proxyDescriptor,
        }
    }
}
