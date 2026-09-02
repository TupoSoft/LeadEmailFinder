import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { HttpModuleOptionsFactoryImpl } from './http-module-options.factory'
import { ConfigModule } from '@nestjs/config'
import { MicrosoftGetCredentialType } from './microsoft-get-credential-type'
import { MicrosoftLogin } from './microsoft-login'
import { MimecastLogin } from './mimecast-login'
import { OfficeApps } from './office-apps'

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useClass: HttpModuleOptionsFactoryImpl,
        }),
    ],
    providers: [MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
    exports: [MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
})
export class CatchAllModule {}
