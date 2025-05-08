import { Module } from '@nestjs/common'
import { DnsService } from './dns.service'

@Module({
    imports: [],
    providers: [DnsService],
})
export class DnsModule {}
