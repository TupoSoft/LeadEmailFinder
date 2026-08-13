import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SmtpVerification } from './smtp-verification.entity'
import { DNS_SERVICE_TOKEN, PROXY_SERVICE_TOKEN, SMTP_CLIENT_FACTORY_TOKEN } from './smtp.constants'
import { SmtpVerifier } from './smtp-verifier'
import { Proxy } from '../../../../../proxy/src/proxy.entity'
import { ProxyRegistryService } from './proxy-registry.service'
import { ProxyModule } from '../../../../../proxy/src/proxy.module'
import { SmtpClientFactory } from './smtp-client.factory'

@Module({
    imports: [ConfigModule, DnsModule, ProxyModule, TypeOrmModule.forFeature([SmtpVerification, Proxy])],
    providers: [
        {
            provide: DNS_SERVICE_TOKEN,
            useExisting: DnsService,
        },
        {
            provide: PROXY_SERVICE_TOKEN,
            useExisting: ProxyRegistryService,
        },
        {
            provide: SMTP_CLIENT_FACTORY_TOKEN,
            useExisting: SmtpClientFactory,
        },
        ProxyRegistryService,
        SmtpClientFactory,
        SmtpVerifier,
    ],
    exports: [SmtpVerifier],
})
export class SmtpModule {}
