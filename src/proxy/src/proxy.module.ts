import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Proxy } from './proxy.entity'
import { ProxyProfile } from './proxy.profile'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'
import { ConfigModule } from '@nestjs/config'
import { ProxyLeaseService } from './proxy-lease.service'
import { ProxyAllocatorService } from './proxy-allocator.service'

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Proxy]),
        ApiKeyModule,
    ],
    providers: [ProxyProfile, ProxyService, ProxyLeaseService, ProxyAllocatorService],
    controllers: [ProxyController],
    exports: [ProxyLeaseService, ProxyAllocatorService],
})
export class ProxyModule {}
