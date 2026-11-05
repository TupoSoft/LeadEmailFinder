import { Module } from '@nestjs/common'
import {
    IdentityModule,
    SERVICE_CREDENTIAL_DIRECTORY,
    SERVICE_CREDENTIAL_WRITER,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthModule,
    PermissionsGuard,
    RolePermissionPolicy,
    SERVICE_CLIENT_GRANT_POLICY,
    ServiceClientGrantPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { ServiceClientsController } from './api/service-clients.controller'
import { API_KEY_GENERATOR, ApiKeyGenerator } from './application/ports/api-key-generator'
import { ServiceClientCreationService } from './application/service-client-creation.service'
import { ServiceClientDeletionService } from './application/service-client-deletion.service'
import { ServiceClientDisablementService } from './application/service-client-disablement.service'
import { ServiceClientListingService } from './application/service-client-listing.service'
import { ServiceClientRotationService } from './application/service-client-rotation.service'
import { generateApiKey } from './infrastructure/api-key-generator'

@Module({
    imports: [IdentityModule, AuthModule],
    controllers: [ServiceClientsController],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        { provide: API_KEY_GENERATOR, useValue: generateApiKey },
        {
            provide: ServiceClientCreationService,
            inject: [SERVICE_CREDENTIAL_WRITER, SERVICE_CLIENT_GRANT_POLICY, API_KEY_GENERATOR],
            useFactory: (
                writer: ServiceCredentialWriter,
                grantPolicy: ServiceClientGrantPolicy,
                generator: ApiKeyGenerator,
            ) => new ServiceClientCreationService(writer, grantPolicy, generator),
        },
        {
            provide: ServiceClientListingService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY],
            useFactory: (directory: ServiceCredentialDirectory) => new ServiceClientListingService(directory),
        },
        {
            provide: ServiceClientRotationService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER, API_KEY_GENERATOR],
            useFactory: (
                directory: ServiceCredentialDirectory,
                writer: ServiceCredentialWriter,
                generator: ApiKeyGenerator,
            ) => new ServiceClientRotationService(directory, writer, generator),
        },
        {
            provide: ServiceClientDisablementService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER],
            useFactory: (directory: ServiceCredentialDirectory, writer: ServiceCredentialWriter) =>
                new ServiceClientDisablementService(directory, writer),
        },
        {
            provide: ServiceClientDeletionService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER],
            useFactory: (directory: ServiceCredentialDirectory, writer: ServiceCredentialWriter) =>
                new ServiceClientDeletionService(directory, writer),
        },
    ],
})
export class ServiceClientManagementModule {}
