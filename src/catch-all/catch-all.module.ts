import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CatchAllHttpModuleOptionsFactory } from './catch-all-http-module-options.factory'
import { LinkedInLogin, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps } from './verifiers'
import { ConfigModule } from '@nestjs/config'

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useClass: CatchAllHttpModuleOptionsFactory,
        }),
    ],
    providers: [LinkedInLogin, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
})
export class CatchAllModule {}
