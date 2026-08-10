import { MODULE_METADATA } from '@nestjs/common/constants'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'
import { ProxyModule } from './proxy.module'

describe('ProxyModule', () => {
    it('imports the API key module required by the proxy controller guard', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProxyModule)).toContain(ApiKeyModule)
    })
})
