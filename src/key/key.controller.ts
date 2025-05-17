import { Controller, Post, Body, Get, Delete, UseGuards } from '@nestjs/common'
import { KeyService } from './key.service'
import { GenerateKeyDto } from './generate-key.dto'
import { ApiKeyGuard } from './guards/api-key.guard'
import { RequireApiPermissions } from './decorators/roles.decorator'
import { KeyPermissions } from './key.enum'

@Controller('key')
export class KeyController {
    constructor(private readonly keyService: KeyService) {}

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Post('generate')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto) {
        const token = await this.keyService.generateKey(generateKeyDto.permissions, generateKeyDto.description)
        return { apiKey: token }
    }

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Get()
    async listKeys() {
        return await this.keyService.listKeys()
    }

    @UseGuards(ApiKeyGuard)
    @RequireApiPermissions(KeyPermissions.ADMIN)
    @Delete('revoke')
    async revokeKey(@Body() body: { token: string }) {
        const success = await this.keyService.revokeKey(body.token)
        return { success }
    }
}
