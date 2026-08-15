import { MODULE_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ProxyModule } from './proxy.module'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_LEASE_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'

describe('ProxyModule', () => {
    it('provides the permission guard required by the proxy controller', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProxyModule)).toEqual(
            expect.arrayContaining([RolePermissionPolicy, PermissionsGuard]),
        )
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
