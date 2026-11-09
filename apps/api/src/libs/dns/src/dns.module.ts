import { Module } from '@nestjs/common'
import { DnsService } from './dns.service'
import { ParseConnectionStringOptionsFactory, RedisModule } from '@tuposoft/lead-email-finder/redis'
import { ConfigModule } from '@nestjs/config'

@Module({
    imports: [
        RedisModule.forRootAsync({
            imports: [ConfigModule],
            useClass: ParseConnectionStringOptionsFactory,
        }),
    ],
    providers: [DnsService],
    exports: [DnsService],
})
export class DnsModule {}
