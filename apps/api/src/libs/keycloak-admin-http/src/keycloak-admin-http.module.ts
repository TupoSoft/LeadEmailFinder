import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { FetchKeycloakAdminHttpClient } from './fetch-keycloak-admin-http-client.service'
import { KEYCLOAK_ADMIN_HTTP } from './keycloak-admin-http'
import {
    createKeycloakAdminHttpConfiguration,
    KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
} from './keycloak-admin-http-configuration'

@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
            useFactory: createKeycloakAdminHttpConfiguration,
            inject: [ConfigService],
        },
        FetchKeycloakAdminHttpClient,
        { provide: KEYCLOAK_ADMIN_HTTP, useExisting: FetchKeycloakAdminHttpClient },
    ],
    exports: [KEYCLOAK_ADMIN_HTTP],
})
export class KeycloakAdminHttpModule {}
