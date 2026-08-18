import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { InvitationIssuanceService } from './invitation-issuance.service'
import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import {
    createKeycloakAdminHttpConfiguration,
    KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
} from './keycloak-admin-http-configuration'
import { KeycloakOrganizationAdminClient } from './keycloak-organization-admin-client.service'
import { KEYCLOAK_ORGANIZATION_ADMIN } from './keycloak-organization-admin'
import { MembershipListingService } from './membership-listing.service'
import { MembershipRemovalService } from './membership-removal.service'
import { MembershipRoleChangeService } from './membership-role-change.service'
import { OrganizationCreationService } from './organization-creation.service'
import { OrganizationsController } from './organizations.controller'

@Module({
    imports: [ConfigModule, IdentityModule],
    controllers: [OrganizationsController],
    providers: [
        OrganizationCreationService,
        InvitationIssuanceService,
        InvitationAcceptanceService,
        MembershipRoleChangeService,
        MembershipRemovalService,
        MembershipListingService,
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
            useFactory: createKeycloakAdminHttpConfiguration,
            inject: [ConfigService],
        },
        KeycloakAdminHttpClient,
        { provide: KEYCLOAK_ORGANIZATION_ADMIN, useClass: KeycloakOrganizationAdminClient },
    ],
})
export class OrganizationOnboardingModule {}
