import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AddProxyCommand } from '../commands/add-proxy.command'
import { AddProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { Model } from 'mongoose'
import { Proxy } from '../proxy.schema'
import { InjectModel } from '@nestjs/mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'

@CommandHandler(AddProxyCommand)
export class AddProxyHandler implements ICommandHandler<AddProxyCommand> {
    constructor(
        @InjectModel(Proxy.name, 'proxy') private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute(command: AddProxyCommand): Promise<AddProxyResponse> {
        const proxy = await this.proxyModel.insertOne(command)
        const proxyDescriptor = this.mapper.map(proxy, Proxy, ProxyDescriptorDto)

        return {
            proxy: proxyDescriptor,
        }
    }
}
