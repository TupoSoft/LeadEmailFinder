import { Body, Controller, ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { ApiKeyResponseDto, GenerateKeyDto, ValidateKeyForRolesDto } from './api-key.dto'
import { plainToInstance } from 'class-transformer'
import { ApiExcludeController } from '@nestjs/swagger'
import { AdminTokenRevocationForbidden, KeyNotFound } from './api-key.error'
import { GrpcMethod } from '@nestjs/microservices'

@ApiExcludeController()
@Controller()
export class ApiKeyController {
    constructor(private readonly keyService: ApiKeyService) {}

    @GrpcMethod('ApiKeyService')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto) {
        const apiKey = await this.keyService.generateKey(generateKeyDto.permissions, generateKeyDto.description)

        return plainToInstance(ApiKeyResponseDto, apiKey.toObject())
    }

    @GrpcMethod('ApiKeyService')
    async listKeys() {
        return await this.keyService.listKeys()
    }

    @GrpcMethod('ApiKeyService')
    async revokeKey(@Body() body: { token: string }) {
        try {
            await this.keyService.revokeKey(body.token)
            return { success: true }
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
    async validateKeyForRoles(@Body() { token, requiredPermissions }: ValidateKeyForRolesDto): Promise<boolean> {
        return await this.keyService.validateKeyForRoles(token, requiredPermissions)
    }
}
