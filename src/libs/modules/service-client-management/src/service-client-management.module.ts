import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { KeycloakAdminHttpModule } from '@tuposoft/lead-email-finder/keycloak-admin-http'
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
import {
    KEYCLOAK_SERVICE_CLIENT_ADMIN,
    KeycloakServiceClientAdmin,
} from './application/ports/keycloak-service-client-admin'
import { ServiceClientCreationService } from './application/service-client-creation.service'
import { ServiceClientDeletionService } from './application/service-client-deletion.service'
import { ServiceClientDisablementService } from './application/service-client-disablement.service'
import {
    SERVICE_CLIENT_MANAGEMENT_CONFIGURATION,
    ServiceClientManagementConfiguration,
} from './application/service-client-management-configuration'
import { ServiceClientListingService } from './application/service-client-listing.service'
import { ServiceClientRotationService } from './application/service-client-rotation.service'
import { createServiceClientManagementConfiguration } from './infrastructure/config/service-client-management-configuration'
import { KeycloakServiceClientAdminClient } from './infrastructure/keycloak/keycloak-service-client-admin-client.service'

@Module({
    imports: [ConfigModule, IdentityModule, AuthModule, KeycloakAdminHttpModule],
    controllers: [ServiceClientsController],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: SERVICE_CLIENT_MANAGEMENT_CONFIGURATION,
            useFactory: createServiceClientManagementConfiguration,
            inject: [ConfigService],
        },
        KeycloakServiceClientAdminClient,
        {
            provide: KEYCLOAK_SERVICE_CLIENT_ADMIN,
            useExisting: KeycloakServiceClientAdminClient,
        },
        {
            provide: ServiceClientCreationService,
            inject: [
                SERVICE_CREDENTIAL_WRITER,
                KEYCLOAK_SERVICE_CLIENT_ADMIN,
                SERVICE_CLIENT_MANAGEMENT_CONFIGURATION,
                SERVICE_CLIENT_GRANT_POLICY,
            ],
            useFactory: (
                writer: ServiceCredentialWriter,
                keycloakAdmin: KeycloakServiceClientAdmin,
                configuration: ServiceClientManagementConfiguration,
                serviceClientGrantPolicy: ServiceClientGrantPolicy,
            ) => new ServiceClientCreationService(writer, keycloakAdmin, configuration, serviceClientGrantPolicy),
        },
        {
            provide: ServiceClientListingService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY],
            useFactory: (directory: ServiceCredentialDirectory) => new ServiceClientListingService(directory),
        },
        {
            provide: ServiceClientRotationService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER, KEYCLOAK_SERVICE_CLIENT_ADMIN],
            useFactory: (
                directory: ServiceCredentialDirectory,
                writer: ServiceCredentialWriter,
                keycloakAdmin: KeycloakServiceClientAdmin,
            ) => new ServiceClientRotationService(directory, writer, keycloakAdmin),
        },
        {
            provide: ServiceClientDisablementService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER],
            useFactory: (directory: ServiceCredentialDirectory, writer: ServiceCredentialWriter) =>
                new ServiceClientDisablementService(directory, writer),
        },
        {
            provide: ServiceClientDeletionService,
            inject: [SERVICE_CREDENTIAL_DIRECTORY, SERVICE_CREDENTIAL_WRITER, KEYCLOAK_SERVICE_CLIENT_ADMIN],
            useFactory: (
                directory: ServiceCredentialDirectory,
                writer: ServiceCredentialWriter,
                keycloakAdmin: KeycloakServiceClientAdmin,
            ) => new ServiceClientDeletionService(directory, writer, keycloakAdmin),
        },
    ],
})
export class ServiceClientManagementModule {}
