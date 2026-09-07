import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ACCOUNT_DISCOVERY_TOKEN } from '../../application/ports/account-discovery'
import { ACCOUNT_DISCOVERY_CLOCK_TOKEN, SYSTEM_CLOCK, configuredAccountDiscovery } from './configured-account-discovery'
import { HttpModuleOptionsFactoryImpl } from './http-module-options.factory'
import { MicrosoftGetCredentialType } from './providers/microsoft-get-credential-type'
import { MicrosoftLogin } from './providers/microsoft-login'
import { MimecastLogin } from './providers/mimecast-login'
import { OfficeApps } from './providers/office-apps'

@Module({
    imports: [
        ConfigModule,
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useClass: HttpModuleOptionsFactoryImpl,
        }),
    ],
    providers: [
        MicrosoftGetCredentialType,
        MicrosoftLogin,
        MimecastLogin,
        OfficeApps,
        {
            provide: ACCOUNT_DISCOVERY_CLOCK_TOKEN,
            useValue: SYSTEM_CLOCK,
        },
        {
            provide: ACCOUNT_DISCOVERY_TOKEN,
            useFactory: configuredAccountDiscovery,
            inject: [
                ConfigService,
                ACCOUNT_DISCOVERY_CLOCK_TOKEN,
                MicrosoftGetCredentialType,
                MicrosoftLogin,
                MimecastLogin,
                OfficeApps,
            ],
        },
    ],
    exports: [ACCOUNT_DISCOVERY_TOKEN],
})
export class AccountDiscoveryModule {}
