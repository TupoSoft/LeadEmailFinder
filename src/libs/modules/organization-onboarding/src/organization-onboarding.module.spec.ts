import { MODULE_METADATA } from '@nestjs/common/constants'
import {
    INVITATION_ACCEPTANCE_STORE,
    INVITATION_STORE,
    INVITATION_PREVIEW_READER,
    MEMBERSHIP_DIRECTORY,
    MEMBERSHIP_MUTATION_STORE,
    ORGANIZATION_REGISTRATION_STORE,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InvitationPreviewService } from './application/invitation-preview.service'
import { InvitationAcceptanceService } from './application/invitation-acceptance.service'
import { InvitationIssuanceService } from './application/invitation-issuance.service'
import { MembershipListingService } from './application/membership-listing.service'
import { MembershipRemovalService } from './application/membership-removal.service'
import { MembershipRoleChangeService } from './application/membership-role-change.service'
import { OrganizationCreationService } from './application/organization-creation.service'
import { KEYCLOAK_ORGANIZATION_ADMIN } from './application/ports/keycloak-organization-admin'
import { KeycloakOrganizationAdminClient } from './infrastructure/keycloak-organization-admin-client.service'
import { OrganizationOnboardingModule } from './organization-onboarding.module'

describe('OrganizationOnboardingModule', () => {
    it('provides every use case via an explicit factory injecting its identity persistence port', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OrganizationOnboardingModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: OrganizationCreationService, inject: [ORGANIZATION_REGISTRATION_STORE] }),
                expect.objectContaining({ provide: InvitationPreviewService, inject: [INVITATION_PREVIEW_READER] }),
                expect.objectContaining({ provide: InvitationIssuanceService, inject: [INVITATION_STORE] }),
                expect.objectContaining({ provide: MembershipListingService, inject: [MEMBERSHIP_DIRECTORY] }),
                expect.objectContaining({ provide: MembershipRemovalService, inject: [MEMBERSHIP_MUTATION_STORE] }),
                expect.objectContaining({
                    provide: MembershipRoleChangeService,
                    inject: [MEMBERSHIP_MUTATION_STORE, KEYCLOAK_ORGANIZATION_ADMIN],
                }),
                expect.objectContaining({
                    provide: InvitationAcceptanceService,
                    inject: expect.arrayContaining([INVITATION_STORE, INVITATION_ACCEPTANCE_STORE, KEYCLOAK_ORGANIZATION_ADMIN]),
                }),
                expect.objectContaining({ provide: KEYCLOAK_ORGANIZATION_ADMIN, useClass: KeycloakOrganizationAdminClient }),
            ]),
        )
    })

    it('exports nothing beyond its public barrel (no providers array leak of application services)', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OrganizationOnboardingModule) as unknown[] | undefined

        expect(exports ?? []).toEqual([])
    })
})
