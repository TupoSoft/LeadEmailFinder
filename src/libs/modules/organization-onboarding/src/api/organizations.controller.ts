import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    GoneException,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
    SerializeOptions,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common'
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiExtraModels,
    ApiForbiddenResponse,
    ApiGoneResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiUnauthorizedResponse,
    getSchemaPath,
} from '@nestjs/swagger'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    CurrentPrincipal,
    Public,
    PermissionsGuard,
    RequirePermissions,
} from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationPreviewService } from '../application/invitation-preview.service'
import { InvitationAcceptanceService } from '../application/invitation-acceptance.service'
import { InvitationIssuanceService } from '../application/invitation-issuance.service'
import { MembershipListingService } from '../application/membership-listing.service'
import { MembershipRemovalService } from '../application/membership-removal.service'
import { MembershipRoleChangeService } from '../application/membership-role-change.service'
import { OrganizationCreationService } from '../application/organization-creation.service'
import { OrganizationListingService } from '../application/organization-listing.service'
import {
    ConflictingMembershipError,
    FinalOwnerConflictError,
    InsufficientPermissionError,
    InvalidOrganizationCursorError,
    InvitationConsumedError,
    InvitationExpiredError,
    InvitationNotFoundError,
    MembershipNotFoundError,
    NotInOrganizationError,
} from '../domain/organization-onboarding.errors'
import {
    AcceptInvitationDto,
    AcceptInvitationParamsDto,
    AcceptInvitationResponseDto,
    ChangeMembershipRoleDto,
    CreateOrganizationDto,
    CreateOrganizationResponseDto,
    InvitationResponseDto,
    InvitationAcceptedResponseDto,
    InvitationPreviewResponseDto,
    InvitationGoneResponseDto,
    IssueInvitationDto,
    ListOrganizationsQueryDto,
    MembershipParamsDto,
    MembershipResponseDto,
    OrganizationParamsDto,
    OrganizationDirectoryResponseDto,
} from './organizations.dto'

const INVITATION_HEADERS = {
    'Cache-Control': {
        description: 'Prevents storage of invitation responses, including failures.',
        schema: { type: 'string' as const, enum: ['no-store'] },
    },
    'Referrer-Policy': {
        description: 'Prevents disclosure of invitation authority in referrers.',
        schema: { type: 'string' as const, enum: ['no-referrer'] },
    },
}
const SESSION_SECURITY: Record<string, string[]>[] = [{ lef_session: [] }, { oidc: [] }]
const MUTATION_SECURITY: Record<string, string[]>[] = [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }]

@UseGuards(PermissionsGuard)
@ApiExtraModels(AcceptInvitationResponseDto, InvitationAcceptedResponseDto)
@Controller('v1/organizations')
export class OrganizationsController {
    constructor(
        private readonly organizationCreation: OrganizationCreationService,
        private readonly invitationIssuance: InvitationIssuanceService,
        private readonly invitationAcceptance: InvitationAcceptanceService,
        private readonly membershipRoleChange: MembershipRoleChangeService,
        private readonly membershipRemoval: MembershipRemovalService,
        private readonly membershipListing: MembershipListingService,
        private readonly invitationPreview: InvitationPreviewService,
        private readonly organizationListing: OrganizationListingService,
    ) {}

    // Declared before the ':organizationId/...' routes so a static-prefix route can never be shadowed.
    @Public()
    @Post('invitations/:token/accept')
    @ApiOperation({
        operationId: 'OrganizationsController_acceptInvitation',
        summary: 'Accept a pending invitation',
        security: [],
        description:
            'Creates or reuses an invited identity. Repeated acceptance has no additional effect and returns only generic accepted status.',
    })
    @ApiCreatedResponse({
        description: 'First acceptance returns account details; replay returns only accepted status.',
        headers: INVITATION_HEADERS,
        schema: {
            oneOf: [
                { $ref: getSchemaPath(AcceptInvitationResponseDto) },
                { $ref: getSchemaPath(InvitationAcceptedResponseDto) },
            ],
        },
    })
    @ApiBadRequestResponse({
        description: 'Password must contain at least 12 characters.',
        headers: INVITATION_HEADERS,
    })
    @ApiNotFoundResponse({
        description: 'Invitation not found. No invitation details are returned.',
        headers: INVITATION_HEADERS,
    })
    @ApiGoneResponse({
        type: InvitationGoneResponseDto,
        description: 'Invitation has expired.',
        headers: INVITATION_HEADERS,
    })
    @ApiConflictResponse({ description: 'The identity already has an active membership.', headers: INVITATION_HEADERS })
    async acceptInvitation(
        @Param() { token }: AcceptInvitationParamsDto,
        @Body() { password }: AcceptInvitationDto,
    ): Promise<AcceptInvitationResponseDto | InvitationAcceptedResponseDto> {
        return this.handleErrors(async () => {
            const result = await this.invitationAcceptance.accept(token, password)
            return 'status' in result
                ? Object.assign(new InvitationAcceptedResponseDto(), result)
                : Object.assign(new AcceptInvitationResponseDto(), result)
        })
    }

    @Public()
    @Get('invitations/:token')
    @ApiOperation({
        operationId: 'OrganizationsController_previewInvitation',
        summary: 'Preview a pending invitation',
        security: [],
        description:
            'Returns display details only while the link retains acceptance authority. Responses are never cacheable.',
    })
    @ApiOkResponse({ type: InvitationPreviewResponseDto, headers: INVITATION_HEADERS })
    @ApiNotFoundResponse({
        description: 'Invitation not found. No invitation details are returned.',
        headers: INVITATION_HEADERS,
    })
    @ApiGoneResponse({
        type: InvitationGoneResponseDto,
        description: 'Invitation has expired or was consumed; no invitation details are returned.',
        headers: INVITATION_HEADERS,
    })
    @SerializeOptions({ type: InvitationPreviewResponseDto })
    async previewInvitation(@Param() { token }: AcceptInvitationParamsDto): Promise<InvitationPreviewResponseDto> {
        return this.handleErrors(() => this.invitationPreview.preview(token))
    }

    @Get()
    @ApiOperation({
        operationId: 'OrganizationsController_list',
        summary: 'List customer organizations for a platform operator',
        security: SESSION_SECURITY,
        description:
            'Requires platform:admin. Orders by millisecond creation time descending and UUID descending. Pass the returned opaque token unchanged; the terminal page omits nextPageToken. No total is calculated.',
    })
    @ApiOkResponse({ type: OrganizationDirectoryResponseDto })
    @ApiBadRequestResponse({ description: 'Page size must be an integer from 1 through 100; the page token must be a supported, valid cursor.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Platform administration permission is required.' })
    @RequirePermissions('platform:admin')
    @SerializeOptions({ type: OrganizationDirectoryResponseDto })
    async list(
        @Query(new ValidationPipe({ transform: true })) { pageSize, pageToken }: ListOrganizationsQueryDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<OrganizationDirectoryResponseDto> {
        return this.handleErrors(() => this.organizationListing.list(principal, pageSize, pageToken))
    }

    @Post()
    @ApiOperation({
        operationId: 'OrganizationsController_create',
        summary: 'Create a customer organization and its first owner invitation',
        security: MUTATION_SECURITY,
        description:
            'Requires platform:admin. Returns the first owner invitation token once, with no email delivery or token recovery. Never persist or log the response. Creation is not idempotent; reconcile an uncertain outcome before explicitly creating again. Cookie sessions require a valid Origin and CSRF header.',
    })
    @ApiCreatedResponse({ type: CreateOrganizationResponseDto, headers: INVITATION_HEADERS })
    @ApiBadRequestResponse({ description: 'Organization name must contain 1 through 200 characters and ownerEmail must be valid.', headers: INVITATION_HEADERS })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: INVITATION_HEADERS })
    @ApiForbiddenResponse({ description: 'Platform administration permission or browser CSRF check denied.', headers: INVITATION_HEADERS })
    @ApiInternalServerErrorResponse({ description: 'Creation outcome may be uncertain; reconcile before creating again.', headers: INVITATION_HEADERS })
    @RequirePermissions('platform:admin')
    @SerializeOptions({ type: CreateOrganizationResponseDto })
    async create(
        @Body() { name, ownerEmail }: CreateOrganizationDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<CreateOrganizationResponseDto> {
        return this.handleErrors(async () => {
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
        })
    }

    @Post(':organizationId/invitations')
    @ApiOperation({
        operationId: 'OrganizationsController_issueInvitation',
        summary: 'Issue an organization invitation',
        security: MUTATION_SECURITY,
        description:
            'Requires members:manage. Only owners can invite another owner. The token is returned once; there is no email delivery or token recovery. Cookie sessions require a valid Origin and CSRF header.',
    })
    @ApiCreatedResponse({ type: InvitationResponseDto, headers: INVITATION_HEADERS })
    @ApiBadRequestResponse({
        description: 'Invalid organization ID, email, or membership role.',
        headers: INVITATION_HEADERS,
    })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: INVITATION_HEADERS })
    @ApiForbiddenResponse({
        description: 'Organization, permission, role hierarchy, or browser CSRF check denied.',
        headers: INVITATION_HEADERS,
    })
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: InvitationResponseDto })
    async issueInvitation(
        @Param() { organizationId }: OrganizationParamsDto,
        @Body() { email, role }: IssueInvitationDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<InvitationResponseDto> {
        return this.handleErrors(async () => {
            const { invitation, rawToken } = await this.invitationIssuance.issue(principal, organizationId, email, role)

            return {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                expiresAt: invitation.expiresAt,
                token: rawToken,
            }
        })
    }

    @Get(':organizationId/members')
    @ApiOperation({
        operationId: 'OrganizationsController_listMembers',
        summary: 'List active and disabled organization members',
        security: SESSION_SECURITY,
        description:
            'Requires members:manage. Results retain actual membership status and nullable email, ordered by createdAt ASC, id ASC.',
    })
    @ApiOkResponse({ type: MembershipResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Invalid organization ID.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Principal lacks members:manage or belongs to another organization.' })
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: MembershipResponseDto })
    async listMembers(
        @Param() { organizationId }: OrganizationParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<MembershipResponseDto[]> {
        return this.handleErrors(async () => {
            const memberships = await this.membershipListing.listForOrganization(principal, organizationId)

            return memberships.map(membership => ({
                id: membership.id,
                email: membership.email,
                role: membership.role,
                status: membership.status,
            }))
        })
    }

    @Patch(':organizationId/members/:membershipId')
    @ApiOperation({
        operationId: 'OrganizationsController_changeRole',
        summary: 'Change an active member role',
        security: MUTATION_SECURITY,
        description:
            'Requires members:manage. Administrators cannot grant or modify owner roles. Cookie sessions require a valid Origin and CSRF header.',
    })
    @ApiOkResponse({ type: MembershipResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid ID or membership role.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Organization, permission, owner hierarchy, or browser CSRF check denied.' })
    @ApiNotFoundResponse({ description: 'Membership not found or disabled.' })
    @ApiConflictResponse({ description: 'The final active owner cannot be demoted.' })
    @RequirePermissions('members:manage')
    @SerializeOptions({ type: MembershipResponseDto })
    async changeRole(
        @Param() { organizationId, membershipId }: MembershipParamsDto,
        @Body() { role }: ChangeMembershipRoleDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<MembershipResponseDto> {
        return this.handleErrors(async () => {
            const membership = await this.membershipRoleChange.changeRole(principal, organizationId, membershipId, role)

            return {
                id: membership.id,
                email: membership.email,
                role: membership.role,
                status: membership.status,
            }
        })
    }

    @Delete(':organizationId/members/:membershipId')
    @ApiOperation({
        operationId: 'OrganizationsController_removeMember',
        summary: 'Disable an organization membership',
        security: MUTATION_SECURITY,
        description:
            'Requires members:manage. Administrators cannot remove owners. Already disabled memberships are an idempotent no-op. Cookie sessions require a valid Origin and CSRF header.',
    })
    @ApiNoContentResponse({ description: 'The membership is disabled; it remains visible in the member list.' })
    @ApiBadRequestResponse({ description: 'Invalid organization or membership ID.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Organization, permission, owner hierarchy, or browser CSRF check denied.' })
    @ApiNotFoundResponse({ description: 'Membership not found.' })
    @ApiConflictResponse({ description: 'The final active owner cannot be removed.' })
    @RequirePermissions('members:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    async removeMember(
        @Param() { organizationId, membershipId }: MembershipParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<void> {
        return this.handleErrors(() => this.membershipRemoval.remove(principal, organizationId, membershipId))
    }

    private async handleErrors<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation()
        } catch (error) {
            if (error instanceof InvalidOrganizationCursorError) {
                throw new BadRequestException(error.message)
            }
            if (error instanceof NotInOrganizationError || error instanceof InsufficientPermissionError) {
                throw new ForbiddenException(error.message)
            }
            if (error instanceof MembershipNotFoundError || error instanceof InvitationNotFoundError) {
                throw new NotFoundException(error.message)
            }
            if (error instanceof ConflictingMembershipError || error instanceof FinalOwnerConflictError) {
                throw new ConflictException(error.message)
            }
            if (error instanceof InvitationExpiredError || error instanceof InvitationConsumedError) {
                throw new GoneException({
                    statusCode: 410,
                    code: error instanceof InvitationExpiredError ? 'invitation_expired' : 'invitation_consumed',
                    message: error.message,
                })
            }
            throw error
        }
    }
}
