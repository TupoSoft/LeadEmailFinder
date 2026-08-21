import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SmtpVerification } from './smtp-verification.entity'
import { DNS_SERVICE_TOKEN, SMTP_CLIENT_FACTORY_TOKEN } from './smtp.constants'
import { SmtpVerifier } from './smtp-verifier'
import { ProxyModule } from '../../../../../proxy/src/proxy.module'
import { SmtpClientFactory } from './smtp-client.factory'

@Module({
    imports: [ConfigModule, DnsModule, ProxyModule, TypeOrmModule.forFeature([SmtpVerification])],
    providers: [
        {
            provide: DNS_SERVICE_TOKEN,
            useExisting: DnsService,
        },
        {
            provide: SMTP_CLIENT_FACTORY_TOKEN,
            useExisting: SmtpClientFactory,
        },
        SmtpClientFactory,
        SmtpVerifier,
    ],
    exports: [SmtpVerifier],
})
export class SmtpModule {}
