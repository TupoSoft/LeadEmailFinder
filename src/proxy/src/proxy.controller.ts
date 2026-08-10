import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    SerializeOptions,
    ValidationPipe,
    UseGuards,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProxyService } from './proxy.service'
import {
    CreateProxyDto,
    HealthyProxyQueryDto,
    ListProxiesQueryDto,
    ProxyDto,
    ProxyListDto,
    ReportBlacklistDto,
    UpdateProxyDto,
} from './proxy.dto'
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/modules/api-key'
import { RequireApiPermissions } from '@tuposoft/lead-email-finder/modules/api-key/application/decorators'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key/domain/key.enum'

@ApiTags('Proxies')
@UseGuards(ApiKeyGuard)
@RequireApiPermissions(KeyPermissions.ADMIN)
@Controller('v1/proxies')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    @Post()
    @ApiOperation({ summary: 'Create a proxy' })
    @ApiCreatedResponse({ type: ProxyDto })
    async createProxy(@Body() dto: CreateProxyDto): Promise<ProxyDto> {
        return await this.proxyService.createProxy(dto)
    }

    @Get()
    @SerializeOptions({ type: ProxyListDto })
    @ApiOperation({ summary: 'List proxies' })
    @ApiOkResponse({ type: ProxyListDto })
    async listProxies(@Query(new ValidationPipe({ transform: true })) query: ListProxiesQueryDto): Promise<ProxyListDto> {
        return await this.proxyService.listProxies(query)
    }

    @Get('healthy')
    @ApiOperation({ summary: 'Select a healthy proxy for an MX host' })
    @ApiOkResponse({ type: ProxyDto })
    async getHealthyProxy(@Query() query: HealthyProxyQueryDto): Promise<ProxyDto | undefined> {
        return await this.proxyService.getHealthyProxy(query.mxHost)
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async getProxy(@Param('id') id: string): Promise<ProxyDto> {
        return await this.proxyService.getProxy(id)
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async updateProxy(@Param('id') id: string, @Body() dto: UpdateProxyDto): Promise<ProxyDto> {
        return await this.proxyService.updateProxy(id, dto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async deleteProxy(@Param('id') id: string): Promise<ProxyDto> {
        return await this.proxyService.deleteProxy(id)
    }

    @Post(':id/blacklists')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Exclude a proxy for an MX host' })
    @ApiNoContentResponse()
    async reportProxyBlacklist(@Param('id') id: string, @Body() dto: ReportBlacklistDto): Promise<void> {
        await this.proxyService.reportProxyBlacklist(id, dto)
    }
}
