import { Module } from '@nestjs/common'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SmtpVerification } from './smtp-verification.entity'
import { DNS_SERVICE_TOKEN, PROXY_SERVICE_TOKEN } from './smtp.constants'
import { SmtpVerifier } from './smtp-verifier'
import { Proxy } from '../../../../../proxy/src/proxy.entity'
import { ProxyRegistryService } from './proxy-registry.service'

@Module({
    imports: [DnsModule, TypeOrmModule.forFeature([SmtpVerification, Proxy])],
    providers: [
        {
            provide: DNS_SERVICE_TOKEN,
            useExisting: DnsService,
        },
        {
            provide: PROXY_SERVICE_TOKEN,
            useExisting: ProxyRegistryService,
        },
        ProxyRegistryService,
        SmtpVerifier,
    ],
    exports: [SmtpVerifier],
})
export class SmtpModule {}
