import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { KeycloakAdminHttpModule } from '@tuposoft/lead-email-finder/keycloak-admin-http'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { InvitationIssuanceService } from './invitation-issuance.service'
import { KeycloakOrganizationAdminClient } from './keycloak-organization-admin-client.service'
import { KEYCLOAK_ORGANIZATION_ADMIN } from './keycloak-organization-admin'
import { MembershipListingService } from './membership-listing.service'
import { MembershipRemovalService } from './membership-removal.service'
import { MembershipRoleChangeService } from './membership-role-change.service'
import { OrganizationCreationService } from './organization-creation.service'
import { OrganizationsController } from './organizations.controller'

@Module({
    imports: [ConfigModule, IdentityModule, KeycloakAdminHttpModule],
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
        { provide: KEYCLOAK_ORGANIZATION_ADMIN, useClass: KeycloakOrganizationAdminClient },
    ],
})
export class OrganizationOnboardingModule {}
