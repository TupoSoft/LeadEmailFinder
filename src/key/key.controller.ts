import { Controller, Post, Body, Get, Delete } from '@nestjs/common'
import { KeyService } from './key.service'
import { GenerateKeyDto } from './generate-key.dto'

@Controller('key')
export class KeyController {
    constructor(private readonly keyService: KeyService) {}

    @Post('generate')
    async generateKey(@Body() generateKeyDto: GenerateKeyDto) {
        const token = await this.keyService.generateKey(generateKeyDto.permissions, generateKeyDto.description)
        return { apiKey: token }
    }

    @Get('list')
    async listKeys() {
        return this.keyService.listKeys()
    }

    @Delete('revoke')
    async revokeKey(@Body() body: { token: string }) {
        const success = await this.keyService.revokeKey(body.token)
        return { success }
    }
}
