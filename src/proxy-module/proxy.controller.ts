import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ProxyService } from './proxy.service'
import { ProxyResponse, UpdateProxyDto } from './dto'
import { RootFilterQuery } from 'mongoose'
import { Proxy } from './proxy.schema'

@Controller('proxies')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    @Get()
    async getAll(@Query() filter: RootFilterQuery<Proxy>): Promise<ProxyResponse[]> {
        return await this.proxyService.get(filter)
    }

    @Get(':id')
    async getById(@Param('id') id: string): Promise<ProxyResponse> {
        return await this.proxyService.getById(id)
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() updateProxyDto: UpdateProxyDto): Promise<ProxyResponse> {
        return await this.proxyService.update(id, updateProxyDto)
    }

    @Delete(':id')
    async remove(@Param('id') id: string): Promise<ProxyResponse> {
        return this.proxyService.remove(id)
    }

    @Post(':id/blacklist')
    async addToBlacklist(@Param('id') id: string, @Body('blacklist') blacklist: string): Promise<ProxyResponse> {
        return this.proxyService.addToBlacklist(id, blacklist)
    }
}
