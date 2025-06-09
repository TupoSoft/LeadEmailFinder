import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    InternalServerErrorException,
    NotFoundException,
    Post,
    UseGuards,
    Request,
    Param,
    HttpCode,
    HttpStatus,
} from '@nestjs/common'
import { KeyService } from './key.service'
import { ApiKeyResponseDto, GenerateKeyDto, RevokeKeyDto } from './key.dto'
import { ApiKeyGuard } from './guards/api-key.guard'
import { JwtAuthGuard } from '../../auth/src/guards/jwt-auth.guard'
import { RequireApiPermissions } from './decorators/roles.decorator'
import { KeyPermissions } from './key.enum'
import { plainToInstance } from 'class-transformer'
import { ApiExcludeController } from '@nestjs/swagger'
import { AdminTokenRevocationForbidden, KeyNotFound } from './key.error'

@ApiExcludeController()
@Controller('keys')
export class KeyController {
    constructor(private readonly keyService: KeyService) {}

    // JWT authenticated endpoints
    @UseGuards(JwtAuthGuard)
    @Post('generate')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto, @Request() req) {
        const apiKey = await this.keyService.generateKey(
            req.user._id.toString(),
            generateKeyDto.permissions,
            generateKeyDto.description,
        )

        return plainToInstance(ApiKeyResponseDto, apiKey.toObject())
    }

    @UseGuards(JwtAuthGuard)
    @Get('my-keys')
    async getMyKeys(@Request() req) {
        const keys = await this.keyService.getKeysByUserId(req.user._id.toString())
        return keys.map(key => plainToInstance(ApiKeyResponseDto, key.toObject()))
    }

    @UseGuards(JwtAuthGuard)
    @Delete('revoke')
    @HttpCode(HttpStatus.OK)
    async revokeKey(@Body() body: RevokeKeyDto, @Request() req) {
        try {
            await this.keyService.revokeKey(body.token, req.user._id.toString(), req.user.isAdmin)
            return { success: true, message: 'Key revoked successfully' }
        } catch (error: unknown) {
            if (error instanceof KeyNotFound) {
                throw new NotFoundException(error.message)
            } else if (error instanceof AdminTokenRevocationForbidden) {
                throw new ForbiddenException(error.message)
            } else if (error instanceof ForbiddenException) {
                throw error
            } else {
                throw new InternalServerErrorException('Failed to revoke key')
            }
        }
    }

    // Admin endpoints using API key
    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Get('all')
    async listAllKeys() {
        const keys = await this.keyService.listKeys()
        return keys.map(key => plainToInstance(ApiKeyResponseDto, key.toObject()))
    }

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Get('user/:userId')
    async getUserKeys(@Param('userId') userId: string) {
        const keys = await this.keyService.getKeysByUserId(userId)
        return keys.map(key => plainToInstance(ApiKeyResponseDto, key.toObject()))
    }

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Delete('user/:userId')
    @HttpCode(HttpStatus.OK)
    async revokeUserKeys(@Param('userId') userId: string) {
        const result = await this.keyService.revokeUserKeys(userId)
        return {
            success: true,
            message: `Revoked ${result.modifiedCount} keys for user ${userId}`,
        }
    }

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Post('cleanup')
    @HttpCode(HttpStatus.OK)
    async cleanupExpiredKeys() {
        const result = await this.keyService.deleteExpiredKeys()
        return {
            success: true,
            message: `Deleted ${result.deletedCount} expired keys`,
        }
    }
}
