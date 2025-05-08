import { Module } from '@nestjs/common'
import { CacheableDnsResolver } from './cacheable-dns-resolver'

@Module({
    imports: [],
    providers: [CacheableDnsResolver],
})
export class DnsModule {}
