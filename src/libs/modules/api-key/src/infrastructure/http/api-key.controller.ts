import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    HttpCode,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
    Param,
    Post,
    SerializeOptions,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { Public } from '../../application/decorators'
import { AdminTokenRevocationForbidden, KeyNotFound } from '../../api-key.error'
import { KeyPermissions } from '../../domain/key.enum'
import {
    ApiKeyDescriptorDto,
    CheckKeyPermissionsRequestDto,
    CheckKeyPermissionsResponseDto,
    GenerateKeyRequestDto,
    GenerateKeyResponseDto,
    RevokeKeyResponseDto,
} from './dto/api-key.dto'
import { ApiKeyService } from '../../application/api-key.service'

@Public()
@ApiTags('API keys')
@Controller('v1/api-keys')
export class ApiKeyController {
    constructor(private readonly keyService: ApiKeyService) {}

    @Post()
    @SerializeOptions({ type: GenerateKeyResponseDto })
    @ApiOperation({ summary: 'Generate an API key' })
    @ApiCreatedResponse({ type: GenerateKeyResponseDto })
    async generateKey(
        @Body() { permissions = [KeyPermissions.READ], description }: GenerateKeyRequestDto,
    ): Promise<GenerateKeyResponseDto> {
        const apiKeyDoc = await this.keyService.generateKey(permissions, description)

        return {
            apiKey: plainToInstance(ApiKeyDescriptorDto, apiKeyDoc),
        }
    }

    @Delete(':token')
    @SerializeOptions({ type: RevokeKeyResponseDto })
    @ApiOperation({ summary: 'Revoke an API key' })
    @ApiOkResponse({ type: RevokeKeyResponseDto })
    async revokeKey(@Param('token') token: string): Promise<RevokeKeyResponseDto> {
        try {
            const apiKeyDoc = await this.keyService.revokeKey(token)

            return {
                apiKey: plainToInstance(ApiKeyDescriptorDto, apiKeyDoc),
            }
        } catch (error: unknown) {
            if (error instanceof KeyNotFound) {
                throw new NotFoundException(error.message)
            }

            if (error instanceof AdminTokenRevocationForbidden) {
                throw new ForbiddenException(error.message)
            }

            throw new InternalServerErrorException('Failed to revoke key')
        }
    }

    @Post('permissions:check')
    @HttpCode(HttpStatus.OK)
    @SerializeOptions({ type: CheckKeyPermissionsResponseDto })
    @ApiOperation({ summary: 'Check API key permissions' })
    @ApiOkResponse({ type: CheckKeyPermissionsResponseDto })
    async checkKeyPermissions(
        @Body() { token, requiredPermissions = [] }: CheckKeyPermissionsRequestDto,
    ): Promise<CheckKeyPermissionsResponseDto> {
        const allowed = await this.keyService.validateKeyForRoles(token, requiredPermissions)

        return { allowed }
    }
}
