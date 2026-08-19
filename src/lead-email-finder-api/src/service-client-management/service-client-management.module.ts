import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import {
    createKeycloakAdminHttpConfiguration,
    KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
} from './keycloak-admin-http-configuration'
import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import { KEYCLOAK_SERVICE_CLIENT_ADMIN } from './keycloak-service-client-admin'
import { KeycloakServiceClientAdminClient } from './keycloak-service-client-admin-client.service'
import { ServiceClientCreationService } from './service-client-creation.service'
import { ServiceClientDeletionService } from './service-client-deletion.service'
import { ServiceClientDisablementService } from './service-client-disablement.service'
import { ServiceClientListingService } from './service-client-listing.service'
import { ServiceClientRotationService } from './service-client-rotation.service'
import { ServiceClientsController } from './service-clients.controller'

@Module({
    imports: [ConfigModule, IdentityModule],
    controllers: [ServiceClientsController],
    providers: [
        ServiceClientCreationService,
        ServiceClientListingService,
        ServiceClientRotationService,
        ServiceClientDisablementService,
        ServiceClientDeletionService,
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
            useFactory: createKeycloakAdminHttpConfiguration,
            inject: [ConfigService],
        },
        KeycloakAdminHttpClient,
        { provide: KEYCLOAK_SERVICE_CLIENT_ADMIN, useClass: KeycloakServiceClientAdminClient },
    ],
})
export class ServiceClientManagementModule {}
