import { Module } from '@nestjs/common'
import { DnsModule, DnsService } from './dns'
import { MongooseModule } from '@nestjs/mongoose'
import { SmtpVerification, SmtpVerificationSchema } from './smtp-verification.schema'
import { ProxyModule, ProxyService } from './proxy'
import { DNS_SERVICE_TOKEN, PROXY_SERVICE_TOKEN } from './smtp.constants'
import { SmtpVerifier } from './smtp-verifier'

@Module({
    imports: [
        DnsModule,
        ProxyModule,
        MongooseModule.forFeature([
            {
                name: SmtpVerification.name,
                schema: SmtpVerificationSchema,
            },
        ]),
    ],
    providers: [
        {
            provide: DNS_SERVICE_TOKEN,
            useValue: DnsService,
        },
        {
            provide: PROXY_SERVICE_TOKEN,
            useValue: ProxyService,
        },
        SmtpVerifier,
    ],
    exports: [SmtpVerifier],
})
export class SmtpModule {}
