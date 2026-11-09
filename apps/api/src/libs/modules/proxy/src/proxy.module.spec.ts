import { MODULE_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ProxyModule } from './proxy.module'
import { PROXY_CANDIDATE_REPOSITORY_TOKEN } from './application/ports/proxy-candidate-repository'
import { PROXY_LEASE_STORE } from './application/ports/proxy-lease-store'
import { PROXY_REPOSITORY } from './application/ports/proxy-repository'
import { ALLOCATION_OBSERVER_TOKEN, PROXY_ALLOCATOR_TOKEN, PROXY_LEASE_SERVICE_TOKEN, PROXY_SERVICE_TOKEN } from './domain/proxy.tokens'

describe('ProxyModule', () => {
    it('provides the permission guard required by the proxy controller', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProxyModule)).toEqual(
            expect.arrayContaining([RolePermissionPolicy, PermissionsGuard]),
        )
    })

    it('binds each private port to its infrastructure adapter', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProxyModule) as Array<{
            provide?: symbol
            useExisting?: unknown
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: PROXY_REPOSITORY }),
                expect.objectContaining({ provide: PROXY_CANDIDATE_REPOSITORY_TOKEN }),
                expect.objectContaining({ provide: PROXY_LEASE_STORE }),
            ]),
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
                expect.objectContaining({ provide: PROXY_SERVICE_TOKEN }),
            ]),
        )
        expect(exports).toEqual([PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN, PROXY_SERVICE_TOKEN])
        expect(exports).not.toContain(PROXY_LEASE_SERVICE_TOKEN)
    })
})
