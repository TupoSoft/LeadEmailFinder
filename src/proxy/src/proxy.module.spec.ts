import { MODULE_METADATA } from '@nestjs/common/constants'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'
import { ProxyModule } from './proxy.module'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_LEASE_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'

describe('ProxyModule', () => {
    it('imports the API key module required by the proxy controller guard', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProxyModule)).toContain(ApiKeyModule)
    })

    it('publishes allocation and observability through tokens while keeping infrastructure adapters private', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProxyModule) as Array<{
            provide?: symbol
            useExisting?: unknown
        }>
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ProxyModule) as unknown[]

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: PROXY_LEASE_SERVICE_TOKEN }),
                expect.objectContaining({ provide: PROXY_ALLOCATOR_TOKEN }),
                expect.objectContaining({ provide: ALLOCATION_OBSERVER_TOKEN }),
            ]),
        )
        expect(exports).toEqual([PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN])
        expect(exports).not.toContain(PROXY_LEASE_SERVICE_TOKEN)
    })
})
