import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Post,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthPrincipal, ServiceCredentialDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { ServiceClientCreationService } from '../application/service-client-creation.service'
import { ServiceClientDeletionService } from '../application/service-client-deletion.service'
import { ServiceClientDisablementService } from '../application/service-client-disablement.service'
import { ServiceClientListingService } from '../application/service-client-listing.service'
import { ServiceClientRotationService } from '../application/service-client-rotation.service'
import {
    DisabledServiceClientRotationError,
    DuplicateServiceClientPermissionsError,
    ServiceClientAccessDeniedError,
    ServiceClientNotFoundError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'
import {
    CreateServiceClientDto,
    ServiceClientMemberParamsDto,
    ServiceClientParamsDto,
    ServiceClientResponseDto,
    ServiceClientSecretResponseDto,
} from './service-clients.dto'

function toResponse(credential: ServiceCredentialDetailRecord): ServiceClientResponseDto {
    return {
        id: credential.id,
        clientId: credential.keycloakClientId,
        description: credential.description,
        permissions: [...credential.permissions],
        status: credential.status,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
    }
}

const SECRET_HEADERS = {
    'Cache-Control': {
        description: 'Prevents storage of all create and rotate responses, including failures.',
        schema: { type: 'string' as const, enum: ['no-store'] },
    },
}
const MUTATION_SECURITY: Record<string, string[]>[] = [{ lef_session: [], 'x-csrf-token': [] }]
const ACCESS_DESCRIPTION =
    'Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header.'

@UseGuards(PermissionsGuard)
@Controller('v1/organizations/:organizationId/service-clients')
export class ServiceClientsController {
    constructor(
        private readonly serviceClientCreation: ServiceClientCreationService,
        private readonly serviceClientListing: ServiceClientListingService,
        private readonly serviceClientRotation: ServiceClientRotationService,
        private readonly serviceClientDisablement: ServiceClientDisablementService,
        private readonly serviceClientDeletion: ServiceClientDeletionService,
    ) {}

    @Post()
    @ApiOperation({
        operationId: 'ServiceClientsController_create',
        summary: 'Create an organization service client and reveal its secret once',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            ' Requested permissions must be unique and within the current account grantableServiceClientPermissions.',
    })
    @ApiCreatedResponse({ type: ServiceClientSecretResponseDto, headers: SECRET_HEADERS })
    @ApiBadRequestResponse({
        description: 'Invalid organization UUID, description, or permissions, including duplicate or excess grants.',
        headers: SECRET_HEADERS,
    })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: SECRET_HEADERS })
    @ApiForbiddenResponse({
        description: 'Organization, credential kind, permission, role, or browser CSRF check denied.',
        headers: SECRET_HEADERS,
    })
    @ApiInternalServerErrorResponse({
        description:
            'Provider or persistence failure. Reconcile the list before explicitly retrying an uncertain outcome.',
        headers: SECRET_HEADERS,
    })
    @RequirePermissions('credentials:manage')
    @SerializeOptions({ type: ServiceClientSecretResponseDto })
    async create(
        @Param() { organizationId }: ServiceClientParamsDto,
        @Body() { description, permissions }: CreateServiceClientDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<ServiceClientSecretResponseDto> {
        return this.handleErrors(async () => {
            const { credential, secret } = await this.serviceClientCreation.create(
                principal,
                organizationId,
                description ?? null,
                permissions,
            )

            return { ...toResponse(credential), clientSecret: secret }
        })
    }

    @Get()
    @ApiOperation({
        operationId: 'ServiceClientsController_list',
        summary: 'List active and disabled service clients without secrets',
        security: [{ lef_session: [] }],
        description:
            ACCESS_DESCRIPTION +
            ' Returns all organization clients ordered by createdAt DESC, id DESC. Existing secrets cannot be retrieved.',
    })
    @ApiOkResponse({ type: ServiceClientResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Invalid organization UUID.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Organization, credential kind, permission, or role check denied.' })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
    @RequirePermissions('credentials:manage')
    @SerializeOptions({ type: ServiceClientResponseDto })
    async list(
        @Param() { organizationId }: ServiceClientParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<ServiceClientResponseDto[]> {
        return this.handleErrors(async () => {
            const credentials = await this.serviceClientListing.list(principal, organizationId)

            return credentials.map(toResponse)
        })
    }

    @Post(':serviceClientId/rotate')
    @ApiOperation({
        operationId: 'ServiceClientsController_rotate',
        summary: 'Invalidate the current secret and reveal a replacement once',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            ' A missing client or a client in another organization returns the same 404. Do not automatically retry when the outcome is uncertain.',
    })
    @ApiOkResponse({ type: ServiceClientSecretResponseDto, headers: SECRET_HEADERS })
    @ApiBadRequestResponse({ description: 'Invalid organization or service-client UUID.', headers: SECRET_HEADERS })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: SECRET_HEADERS })
    @ApiForbiddenResponse({
        description: 'Credential kind, permission, role, or browser CSRF check denied.',
        headers: SECRET_HEADERS,
    })
    @ApiNotFoundResponse({
        description: 'Service client not found, including a client outside the caller organization.',
        headers: SECRET_HEADERS,
    })
    @ApiConflictResponse({
        description: 'The service client is disabled and cannot be rotated.',
        headers: SECRET_HEADERS,
    })
    @ApiInternalServerErrorResponse({
        description:
            'Provider or persistence failure. The secret may already have changed; reconcile before explicitly retrying.',
        headers: SECRET_HEADERS,
    })
    @RequirePermissions('credentials:manage')
    @HttpCode(HttpStatus.OK)
    @SerializeOptions({ type: ServiceClientSecretResponseDto })
    async rotate(
        @Param() { organizationId, serviceClientId }: ServiceClientMemberParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<ServiceClientSecretResponseDto> {
        return this.handleErrors(async () => {
            const { credential, secret } = await this.serviceClientRotation.rotate(
                principal,
                organizationId,
                serviceClientId,
            )

            return { ...toResponse(credential), clientSecret: secret }
        })
    }

    @Post(':serviceClientId/disable')
    @ApiOperation({
        operationId: 'ServiceClientsController_disable',
        summary: 'Disable a service client immediately',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            ' Revokes request authentication locally. Disabled clients remain listed. There is no re-enable endpoint.',
    })
    @ApiNoContentResponse({ description: 'Client disabled; repeated disablement has no additional effect.' })
    @ApiBadRequestResponse({ description: 'Invalid organization or service-client UUID.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Credential kind, permission, role, or browser CSRF check denied.' })
    @ApiNotFoundResponse({
        description: 'Service client not found, including a client outside the caller organization.',
    })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
    @RequirePermissions('credentials:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    async disable(
        @Param() { organizationId, serviceClientId }: ServiceClientMemberParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<void> {
        return this.handleErrors(() =>
            this.serviceClientDisablement.disable(principal, organizationId, serviceClientId),
        )
    }

    @Delete(':serviceClientId')
    @ApiOperation({
        operationId: 'ServiceClientsController_remove',
        summary: 'Delete a service client and its provider client',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            ' Deletes the provider client and local credential. An already-missing provider client is treated as success.',
    })
    @ApiNoContentResponse({ description: 'Service client deleted.' })
    @ApiBadRequestResponse({ description: 'Invalid organization or service-client UUID.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Credential kind, permission, role, or browser CSRF check denied.' })
    @ApiNotFoundResponse({
        description: 'Service client not found, including a client outside the caller organization.',
    })
    @ApiInternalServerErrorResponse({ description: 'Provider or persistence failure.' })
    @RequirePermissions('credentials:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(
        @Param() { organizationId, serviceClientId }: ServiceClientMemberParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<void> {
        return this.handleErrors(() => this.serviceClientDeletion.delete(principal, organizationId, serviceClientId))
    }

    private async handleErrors<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation()
        } catch (error) {
            if (error instanceof ServiceClientAccessDeniedError) {
                throw new ForbiddenException(error.message)
            }
            if (
                error instanceof ServiceClientPermissionCeilingExceededError ||
                error instanceof DuplicateServiceClientPermissionsError
            ) {
                throw new BadRequestException(error.message)
            }
            if (error instanceof ServiceClientNotFoundError) {
                throw new NotFoundException(error.message)
            }
            if (error instanceof DisabledServiceClientRotationError) {
                throw new ConflictException(error.message)
            }
            throw error
        }
    }
}
