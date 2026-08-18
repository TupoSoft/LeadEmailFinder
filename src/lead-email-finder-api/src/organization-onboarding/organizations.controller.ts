import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal, Public, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { InvitationIssuanceService } from './invitation-issuance.service'
import { MembershipListingService } from './membership-listing.service'
import { MembershipRemovalService } from './membership-removal.service'
import { MembershipRoleChangeService } from './membership-role-change.service'
import { OrganizationCreationService } from './organization-creation.service'
import {
    AcceptInvitationDto,
    AcceptInvitationParamsDto,
    AcceptInvitationResponseDto,
    ChangeMembershipRoleDto,
    CreateOrganizationDto,
    CreateOrganizationResponseDto,
    InvitationResponseDto,
    IssueInvitationDto,
    MembershipParamsDto,
    MembershipResponseDto,
    OrganizationParamsDto,
} from './organizations.dto'

@UseGuards(PermissionsGuard)
@ApiExcludeController()
@Controller('v1/organizations')
export class OrganizationsController {
    constructor(
        private readonly organizationCreation: OrganizationCreationService,
        private readonly invitationIssuance: InvitationIssuanceService,
        private readonly invitationAcceptance: InvitationAcceptanceService,
        private readonly membershipRoleChange: MembershipRoleChangeService,
        private readonly membershipRemoval: MembershipRemovalService,
        private readonly membershipListing: MembershipListingService,
    ) {}

    // Declared before the ':organizationId/...' routes so a static-prefix route can never be shadowed.
    @Public()
    @Post('invitations/:token/accept')
    @SerializeOptions({ type: AcceptInvitationResponseDto })
    async acceptInvitation(
        @Param() { token }: AcceptInvitationParamsDto,
        @Body() { password }: AcceptInvitationDto,
    ): Promise<AcceptInvitationResponseDto> {
        return this.invitationAcceptance.accept(token, password)
    }

    @Post()
    @RequirePermissions('platform:admin')
    @SerializeOptions({ type: CreateOrganizationResponseDto })
    async create(
        @Body() { name, ownerEmail }: CreateOrganizationDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<CreateOrganizationResponseDto> {
        const { organization, invitation, rawToken } = await this.organizationCreation.createWithFirstOwner(
            principal,
            name,
            ownerEmail,
        )

        return {
            organizationId: organization.id,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                expiresAt: invitation.expiresAt,
                token: rawToken,
            },
        }
    }

    @Post(':organizationId/invitations')
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: InvitationResponseDto })
    async issueInvitation(
        @Param() { organizationId }: OrganizationParamsDto,
        @Body() { email, role }: IssueInvitationDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<InvitationResponseDto> {
        const { invitation, rawToken } = await this.invitationIssuance.issue(principal, organizationId, email, role)

        return {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            token: rawToken,
        }
    }

    @Get(':organizationId/members')
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: MembershipResponseDto })
    async listMembers(
        @Param() { organizationId }: OrganizationParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<MembershipResponseDto[]> {
        const memberships = await this.membershipListing.listActive(principal, organizationId)

        return memberships.map(membership => ({
            id: membership.id,
            email: membership.externalIdentity.email,
            role: membership.role,
            status: membership.status,
        }))
    }

    @Patch(':organizationId/members/:membershipId')
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: MembershipResponseDto })
    async changeRole(
        @Param() { organizationId, membershipId }: MembershipParamsDto,
        @Body() { role }: ChangeMembershipRoleDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<MembershipResponseDto> {
        const membership = await this.membershipRoleChange.changeRole(principal, organizationId, membershipId, role)

        return {
            id: membership.id,
            email: membership.externalIdentity.email,
            role: membership.role,
            status: membership.status,
        }
    }

    @Delete(':organizationId/members/:membershipId')
    @RequirePermissions('members:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    async removeMember(
        @Param() { organizationId, membershipId }: MembershipParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<void> {
        await this.membershipRemoval.remove(principal, organizationId, membershipId)
    }
}
