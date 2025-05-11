import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Proxy, ProxySchema } from './proxy.schema'
import { ProxyProfile } from './proxy.profile'
import { ProxyService } from './proxy.service'

@Module({
    imports: [MongooseModule.forFeature([{ name: Proxy.name, schema: ProxySchema }])],
    providers: [ProxyProfile, ProxyService],
    exports: [ProxyService],
})
export class ProxyModule {}
