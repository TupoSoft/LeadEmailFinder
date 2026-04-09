import {
    Controller,
    ForbiddenException,
    InternalServerErrorException,
    NotFoundException,
    SerializeOptions,
    UseFilters,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'
import {
    ApiKeyServiceController,
    ApiKeyServiceControllerMethods,
} from '@tuposoft/lead-email-finder/proto/api_key/v1/api_key'
import { Public } from '@tuposoft/lead-email-finder/modules/api-key/application/decorators'
import { AdminTokenRevocationForbidden, KeyNotFound } from '@tuposoft/lead-email-finder/modules/api-key/api-key.error'
import {
    ApiKeyDescriptorDto,
    CheckKeyPermissionsRequestDto,
    CheckKeyPermissionsResponseDto,
    GenerateKeyRequestDto,
    GenerateKeyResponseDto,
    RevokeKeyRequestDto,
    RevokeKeyResponseDto,
} from './dto/api-key.dto'
import { ApiKeyService } from '@tuposoft/lead-email-finder/modules/api-key/application/api-key.service'

@Public()
@Controller()
@UseFilters(new HttpToGrpcExceptionFilter())
@ApiKeyServiceControllerMethods()
export class ApiKeyController implements ApiKeyServiceController {
    constructor(private readonly keyService: ApiKeyService) {}

    @SerializeOptions({ type: GenerateKeyResponseDto })
    async generateKey({ permissions, description }: GenerateKeyRequestDto): Promise<GenerateKeyResponseDto> {
        const apiKeyDoc = await this.keyService.generateKey(permissions, description)
        const apiKey = plainToInstance(ApiKeyDescriptorDto, apiKeyDoc)

        return {
            apiKey,
        }
    }

    @SerializeOptions({ type: RevokeKeyResponseDto })
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

    @SerializeOptions({ type: CheckKeyPermissionsResponseDto })
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
