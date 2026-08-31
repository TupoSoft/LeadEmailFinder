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
import { ApiExcludeController } from '@nestjs/swagger'
import { AuthPrincipal, ServiceCredentialDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { ServiceClientCreationService } from '../application/service-client-creation.service'
import { ServiceClientDeletionService } from '../application/service-client-deletion.service'
import { ServiceClientDisablementService } from '../application/service-client-disablement.service'
import { ServiceClientListingService } from '../application/service-client-listing.service'
import { ServiceClientRotationService } from '../application/service-client-rotation.service'
import {
    DisabledServiceClientRotationError,
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

@UseGuards(PermissionsGuard)
@ApiExcludeController()
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
    @RequirePermissions('credentials:manage')
    @HttpCode(HttpStatus.NO_CONTENT)
    async disable(
        @Param() { organizationId, serviceClientId }: ServiceClientMemberParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<void> {
        return this.handleErrors(() => this.serviceClientDisablement.disable(principal, organizationId, serviceClientId))
    }

    @Delete(':serviceClientId')
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
            if (error instanceof ServiceClientPermissionCeilingExceededError) {
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
