import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CatchAllHttpModuleOptionsFactory } from './catch-all-http-module-options.factory'
import { LinkedInLogin } from './linkedin-login'
import { MicrosoftGetCredentialType } from './microsoft-get-credential-type'

@Module({
    imports: [
        HttpModule.registerAsync({
            useClass: CatchAllHttpModuleOptionsFactory,
        }),
    ],
    providers: [LinkedInLogin, MicrosoftGetCredentialType],
})
export class CatchAllModule {}
