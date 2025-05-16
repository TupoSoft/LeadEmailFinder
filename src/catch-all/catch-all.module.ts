import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CatchAllHttpModuleOptionsFactory } from './catch-all-http-module-options.factory'
import { LinkedInLogin } from './linkedin-login'
import { MicrosoftGetCredentialType } from './microsoft-get-credential-type'
import { ConfigModule } from '@nestjs/config'
import { MicrosoftLogin } from './microsoft-login'

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useClass: CatchAllHttpModuleOptionsFactory,
        }),
    ],
    providers: [LinkedInLogin, MicrosoftGetCredentialType, MicrosoftLogin],
})
export class CatchAllModule {}
