import { Module } from '@nestjs/common'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SmtpVerification } from './smtp-verification.entity'
import { ProxyModule, ProxyService } from './proxy'
import { DNS_SERVICE_TOKEN, PROXY_SERVICE_TOKEN } from './smtp.constants'
import { SmtpVerifier } from './smtp-verifier'

@Module({
    imports: [DnsModule, ProxyModule, TypeOrmModule.forFeature([SmtpVerification])],
    providers: [
        {
            provide: DNS_SERVICE_TOKEN,
            useExisting: DnsService,
        },
        {
            provide: PROXY_SERVICE_TOKEN,
            useExisting: ProxyService,
        },
        SmtpVerifier,
    ],
    exports: [SmtpVerifier],
})
export class SmtpModule {}
