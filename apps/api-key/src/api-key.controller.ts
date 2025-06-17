import {
    Controller,
    ForbiddenException,
    InternalServerErrorException,
    NotFoundException,
    UseFilters,
} from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import {
    ApiKeyDescriptorDto,
    CheckKeyPermissionsRequestDto,
    CheckKeyPermissionsResponseDto,
    GenerateKeyRequestDto,
    GenerateKeyResponseDto,
    RevokeKeyRequestDto,
    RevokeKeyResponseDto,
} from './api-key.dto'
import { AdminTokenRevocationForbidden, KeyNotFound } from './api-key.error'
import { Public } from '@tuposoft/lead-email-finder/key'
import { plainToInstance } from 'class-transformer'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'
import {
    ApiKeyServiceController,
    ApiKeyServiceControllerMethods,
} from '@tuposoft/lead-email-finder/proto/api_key/v1/api_key'

@Public()
@Controller()
@UseFilters(new HttpToGrpcExceptionFilter())
@ApiKeyServiceControllerMethods()
export class ApiKeyController implements ApiKeyServiceController {
    constructor(private readonly keyService: ApiKeyService) {}

    async generateKey({ permissions, description }: GenerateKeyRequestDto): Promise<GenerateKeyResponseDto> {
        const apiKeyDoc = await this.keyService.generateKey(permissions, description)
        const apiKey = plainToInstance(ApiKeyDescriptorDto, apiKeyDoc)

        return {
            apiKey,
        }
    }

    async revokeKey({ token }: RevokeKeyRequestDto): Promise<RevokeKeyResponseDto> {
        try {
            const apiKeyDoc = await this.keyService.revokeKey(token)
            const apiKey = plainToInstance(ApiKeyDescriptorDto, apiKeyDoc)

            return {
                apiKey,
            }
        } catch (error: unknown) {
            if (error instanceof KeyNotFound) {
                throw new NotFoundException(error.message)
            } else if (error instanceof AdminTokenRevocationForbidden) {
                throw new ForbiddenException(error.message)
            } else {
                throw new InternalServerErrorException('Failed to revoke key')
            }
        }
    }

    async checkKeyPermissions({
        token,
        requiredPermissions = [],
    }: CheckKeyPermissionsRequestDto): Promise<CheckKeyPermissionsResponseDto> {
        const allowed = await this.keyService.validateKeyForRoles(token, requiredPermissions)

        return {
            allowed,
        }
    }
}
