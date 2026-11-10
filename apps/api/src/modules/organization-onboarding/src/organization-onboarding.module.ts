import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { KeycloakAdminHttpModule } from '@tuposoft/lead-email-finder/keycloak-admin-http'
import {
    IdentityModule,
    INVITATION_ACCEPTANCE_STORE,
    INVITATION_STORE,
    INVITATION_PREVIEW_READER,
    InvitationPreviewReader,
    InvitationAcceptanceStore,
    InvitationStore,
    MEMBERSHIP_DIRECTORY,
    MEMBERSHIP_MUTATION_STORE,
    MembershipDirectory,
    MembershipMutationStore,
    ORGANIZATION_REGISTRATION_STORE,
    OrganizationRegistrationStore,
    ORGANIZATION_DIRECTORY_READER,
    OrganizationDirectoryReader,
} from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationPreviewService } from './application/invitation-preview.service'
import { InvitationAcceptanceService } from './application/invitation-acceptance.service'
import { InvitationIssuanceService } from './application/invitation-issuance.service'
import { MembershipListingService } from './application/membership-listing.service'
import { MembershipRemovalService } from './application/membership-removal.service'
import { MembershipRoleChangeService } from './application/membership-role-change.service'
import { OrganizationCreationService } from './application/organization-creation.service'
import { OrganizationDetailService } from './application/organization-detail.service'
import { OrganizationListingService } from './application/organization-listing.service'
import { KEYCLOAK_ORGANIZATION_ADMIN, KeycloakOrganizationAdmin } from './application/ports/keycloak-organization-admin'
import { KeycloakOrganizationAdminClient } from './infrastructure/keycloak-organization-admin-client.service'

@Module({
    imports: [ConfigModule, IdentityModule, KeycloakAdminHttpModule],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        { provide: KEYCLOAK_ORGANIZATION_ADMIN, useClass: KeycloakOrganizationAdminClient },
        {
            provide: OrganizationDetailService,
            inject: [ORGANIZATION_DIRECTORY_READER],
            useFactory: (reader: OrganizationDirectoryReader) => new OrganizationDetailService(reader),
        },
        {
            provide: OrganizationListingService,
            inject: [ORGANIZATION_DIRECTORY_READER],
            useFactory: (reader: OrganizationDirectoryReader) => new OrganizationListingService(reader),
        },
        {
            provide: OrganizationCreationService,
            inject: [ORGANIZATION_REGISTRATION_STORE],
            useFactory: (store: OrganizationRegistrationStore) => new OrganizationCreationService(store),
        },
        {
            provide: InvitationIssuanceService,
            inject: [INVITATION_STORE],
            useFactory: (store: InvitationStore) => new InvitationIssuanceService(store),
        },
        {
            provide: InvitationPreviewService,
            inject: [INVITATION_PREVIEW_READER],
            useFactory: (reader: InvitationPreviewReader) => new InvitationPreviewService(reader),
        },
        {
            provide: InvitationAcceptanceService,
            inject: [INVITATION_STORE, INVITATION_ACCEPTANCE_STORE, KEYCLOAK_ORGANIZATION_ADMIN, ConfigService],
            useFactory: (
                invitationStore: InvitationStore,
                acceptanceStore: InvitationAcceptanceStore,
                keycloakAdmin: KeycloakOrganizationAdmin,
                configService: ConfigService,
            ) =>
                new InvitationAcceptanceService(
                    invitationStore,
                    acceptanceStore,
                    keycloakAdmin,
                    configService.getOrThrow<string>('OIDC_ISSUER_URL'),
                ),
        },
        {
            provide: MembershipListingService,
            inject: [MEMBERSHIP_DIRECTORY],
            useFactory: (directory: MembershipDirectory) => new MembershipListingService(directory),
        },
        {
            provide: MembershipRoleChangeService,
            inject: [MEMBERSHIP_MUTATION_STORE, KEYCLOAK_ORGANIZATION_ADMIN],
            useFactory: (store: MembershipMutationStore, keycloakAdmin: KeycloakOrganizationAdmin) =>
                new MembershipRoleChangeService(store, keycloakAdmin),
        },
        {
            provide: MembershipRemovalService,
            inject: [MEMBERSHIP_MUTATION_STORE],
            useFactory: (store: MembershipMutationStore) => new MembershipRemovalService(store),
        },
    ],
})
export class OrganizationOnboardingModule {}
