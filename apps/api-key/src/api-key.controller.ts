import {
    Body,
    Controller,
    ForbiddenException,
    InternalServerErrorException,
    NotFoundException,
    SerializeOptions,
} from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { ApiKeyResponseDto, BoolValueDto, GenerateKeyDto, ValidateKeyForRolesDto } from './api-key.dto'
import { ApiExcludeController } from '@nestjs/swagger'
import { AdminTokenRevocationForbidden, KeyNotFound } from './api-key.error'
import { GrpcMethod } from '@nestjs/microservices'
import { Public } from '@tuposoft/lead-email-finder/key'
import { plainToInstance } from 'class-transformer'

@Public()
@ApiExcludeController()
@Controller()
export class ApiKeyController {
    constructor(private readonly keyService: ApiKeyService) {}

    @GrpcMethod('ApiKeyService')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto): Promise<ApiKeyResponseDto> {
        const apiKey = await this.keyService.generateKey(generateKeyDto.permissions, generateKeyDto.description)
        return plainToInstance(ApiKeyResponseDto, apiKey)
    }

    @GrpcMethod('ApiKeyService')
    async revokeKey(@Body() body: { token: string }): Promise<ApiKeyResponseDto> {
        try {
            const apiKey = await this.keyService.revokeKey(body.token)
            return plainToInstance(ApiKeyResponseDto, apiKey)
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

    @GrpcMethod('ApiKeyService')
    @SerializeOptions({ type: BoolValueDto })
    async validateKeyForRoles({ token, requiredPermissions = [] }: ValidateKeyForRolesDto): Promise<BoolValueDto> {
        const value = await this.keyService.validateKeyForRoles(token, requiredPermissions)

        return {
            value,
        }
    }
}
