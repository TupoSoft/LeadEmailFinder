import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AddProxyCommand } from './add-proxy.command'
import { AddProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Proxy } from '../proxy.entity'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from '../proxy.dto'

@CommandHandler(AddProxyCommand)
export class AddProxyHandler implements ICommandHandler<AddProxyCommand> {
    constructor(
        @InjectRepository(Proxy, 'proxy') private readonly proxyRepo: Repository<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    // noinspection JSUnusedGlobalSymbols
    async execute(command: AddProxyCommand): Promise<AddProxyResponse> {
        const proxy = await this.proxyRepo.save(this.proxyRepo.create(command))
        const proxyDescriptor = this.mapper.map(proxy, Proxy, ProxyDescriptorDto)

        return {
            proxy: proxyDescriptor,
        }
    }
}
