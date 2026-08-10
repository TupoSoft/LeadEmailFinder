import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Proxy } from './proxy.entity'
import { ProxyProfile } from './proxy.profile'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([Proxy]),
    ],
    providers: [ProxyProfile, ProxyService],
    controllers: [ProxyController],
})
export class ProxyModule {}
