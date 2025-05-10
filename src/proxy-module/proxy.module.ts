import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Proxy, ProxySchema } from './proxy.schema'
import { ProxyProfile } from './proxy.profile'
import { ProxyService } from './proxy.service'
import { ProxyController } from './proxy.controller'

@Module({
    imports: [MongooseModule.forFeature([{ name: Proxy.name, schema: ProxySchema }])],
    controllers: [ProxyController],
    providers: [ProxyProfile, ProxyService],
    exports: [ProxyService],
})
export class ProxyModule {}
