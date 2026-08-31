import { MODULE_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import {
    SERVICE_CREDENTIAL_DIRECTORY,
    SERVICE_CREDENTIAL_WRITER,
} from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { KEYCLOAK_SERVICE_CLIENT_ADMIN } from './application/ports/keycloak-service-client-admin'
import { ServiceClientCreationService } from './application/service-client-creation.service'
import { ServiceClientDeletionService } from './application/service-client-deletion.service'
import { ServiceClientDisablementService } from './application/service-client-disablement.service'
import { SERVICE_CLIENT_MANAGEMENT_CONFIGURATION } from './application/service-client-management-configuration'
import { ServiceClientListingService } from './application/service-client-listing.service'
import { ServiceClientRotationService } from './application/service-client-rotation.service'
import { createServiceClientManagementConfiguration } from './infrastructure/config/service-client-management-configuration'
import { KeycloakServiceClientAdminClient } from './infrastructure/keycloak/keycloak-service-client-admin-client.service'
import { ServiceClientManagementModule } from './service-client-management.module'

interface ProviderMetadata {
    provide?: unknown
    inject?: readonly unknown[]
    useExisting?: unknown
    useFactory?: unknown
}

describe('ServiceClientManagementModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ServiceClientManagementModule) as ProviderMetadata[]

    function providerFor(token: unknown): ProviderMetadata | undefined {
        return providers.find(provider => provider.provide === token)
    }

    it('binds the feature configuration and private Keycloak port', () => {
        expect(providerFor(SERVICE_CLIENT_MANAGEMENT_CONFIGURATION)).toEqual(
            expect.objectContaining({
                inject: [ConfigService],
                useFactory: createServiceClientManagementConfiguration,
            }),
        )
        expect(providerFor(KEYCLOAK_SERVICE_CLIENT_ADMIN)).toEqual(
            expect.objectContaining({ useExisting: KeycloakServiceClientAdminClient }),
        )
    })

    it('constructs every framework-free use case through an explicit factory', () => {
        expect(providerFor(ServiceClientCreationService)?.inject).toEqual([
            SERVICE_CREDENTIAL_WRITER,
            KEYCLOAK_SERVICE_CLIENT_ADMIN,
            SERVICE_CLIENT_MANAGEMENT_CONFIGURATION,
            RolePermissionPolicy,
        ])
        expect(providerFor(ServiceClientListingService)?.inject).toEqual([SERVICE_CREDENTIAL_DIRECTORY])
        expect(providerFor(ServiceClientRotationService)?.inject).toEqual([
            SERVICE_CREDENTIAL_DIRECTORY,
            SERVICE_CREDENTIAL_WRITER,
            KEYCLOAK_SERVICE_CLIENT_ADMIN,
        ])
        expect(providerFor(ServiceClientDisablementService)?.inject).toEqual([
            SERVICE_CREDENTIAL_DIRECTORY,
            SERVICE_CREDENTIAL_WRITER,
        ])
        expect(providerFor(ServiceClientDeletionService)?.inject).toEqual([
            SERVICE_CREDENTIAL_DIRECTORY,
            SERVICE_CREDENTIAL_WRITER,
            KEYCLOAK_SERVICE_CLIENT_ADMIN,
        ])

        for (const token of [
            ServiceClientCreationService,
            ServiceClientListingService,
            ServiceClientRotationService,
            ServiceClientDisablementService,
            ServiceClientDeletionService,
        ]) {
            expect(providerFor(token)?.useFactory).toEqual(expect.any(Function))
        }
    })
})
