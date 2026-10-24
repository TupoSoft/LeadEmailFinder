import { MODULE_METADATA } from '@nestjs/common/constants'
import { SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthModule, SERVICE_CLIENT_GRANT_POLICY } from '@tuposoft/lead-email-finder/modules/auth'
import { API_KEY_GENERATOR } from './application/ports/api-key-generator'
import { ServiceClientCreationService } from './application/service-client-creation.service'
import { ServiceClientDeletionService } from './application/service-client-deletion.service'
import { ServiceClientDisablementService } from './application/service-client-disablement.service'
import { ServiceClientListingService } from './application/service-client-listing.service'
import { ServiceClientRotationService } from './application/service-client-rotation.service'
import { ServiceClientManagementModule } from './service-client-management.module'
import { generateApiKey } from './infrastructure/api-key-generator'

describe('ServiceClientManagementModule', () => {
    const providers: { provide?: unknown; inject?: unknown[]; useValue?: unknown; useFactory?: unknown }[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ServiceClientManagementModule)
    const providerFor = (token: unknown): (typeof providers)[number] | undefined =>
        providers.find(provider => provider.provide === token)
    it('composes local persistence, the auth grant policy, and the crypto generator', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServiceClientManagementModule)).toContain(AuthModule)
        expect(providerFor(API_KEY_GENERATOR)?.useValue).toBe(generateApiKey)
        expect(providerFor(ServiceClientCreationService)?.inject).toEqual([
            SERVICE_CREDENTIAL_WRITER,
            SERVICE_CLIENT_GRANT_POLICY,
            API_KEY_GENERATOR,
        ])
        expect(providerFor(ServiceClientRotationService)?.inject).toEqual([
            SERVICE_CREDENTIAL_DIRECTORY,
            SERVICE_CREDENTIAL_WRITER,
            API_KEY_GENERATOR,
        ])
        expect(providerFor(ServiceClientListingService)?.inject).toEqual([SERVICE_CREDENTIAL_DIRECTORY])
        for (const token of [ServiceClientDisablementService, ServiceClientDeletionService]) {
            expect(providerFor(token)?.inject).toEqual([SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER])
            expect(providerFor(token)?.useFactory).toEqual(expect.any(Function))
        }
    })
})
