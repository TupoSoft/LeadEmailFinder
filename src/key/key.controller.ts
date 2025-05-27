import { Controller, Post, Body, Get, Delete, UseGuards } from '@nestjs/common'
import { KeyService } from './key.service'
import { GenerateKeyDto } from './key.dto'
import { ApiKeyGuard } from './guards/api-key.guard'
import { RequireApiPermissions } from './decorators/roles.decorator'
import { ApiKeyResponseDto } from './key.dto'
import { KeyPermissions } from './key.enum'
import { plainToInstance } from 'class-transformer'

@UseGuards(ApiKeyGuard)
@RequireApiPermissions(KeyPermissions.ADMIN)
@Controller('key')
export class KeyController {
    constructor(private readonly keyService: KeyService) {}

    @Post('generate')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto) {
        const apiKey = await this.keyService.generateKey(generateKeyDto.permissions, generateKeyDto.description)

        return plainToInstance(ApiKeyResponseDto, apiKey.toObject())
    }
    @Get()
    async listKeys() {
        return await this.keyService.listKeys()
    }

    @Delete('revoke')
    async revokeKey(@Body() body: { token: string }) {
        const success = await this.keyService.revokeKey(body.token)
        return { success }
    }
}
