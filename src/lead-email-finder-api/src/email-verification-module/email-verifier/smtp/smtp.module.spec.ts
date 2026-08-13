import { MODULE_METADATA } from '@nestjs/common/constants'
import { ConfigModule } from '@nestjs/config'
import { SMTP_CLIENT_FACTORY_TOKEN } from './smtp.constants'
import { SmtpClientFactory } from './smtp-client.factory'
import { SmtpModule } from './smtp.module'

describe('SmtpModule', () => {
    it('wires the configurable SMTP client factory', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SmtpModule) as unknown[]
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SmtpModule) as Array<{
            provide?: string
            useExisting?: unknown
        }>

        expect(imports).toContain(ConfigModule)
        expect(providers).toContain(SmtpClientFactory)
        expect(providers).toContainEqual({
            provide: SMTP_CLIENT_FACTORY_TOKEN,
            useExisting: SmtpClientFactory,
        })
    })
})
