import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
    SerializeOptions,
    ValidationPipe,
    UseGuards,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { ProxyNotFoundError } from '../application/proxy-not-found.error'
import { ProxyService, ProxyValidationError } from '../application/proxy.service'
import {
    CreateProxyDto,
    HealthyProxyQueryDto,
    ListProxiesQueryDto,
    ProxyDto,
    ProxyListDto,
    ReportBlacklistDto,
    UpdateProxyDto,
} from './proxy.dto'
import { toProxyDto, toProxyListDto } from './proxy-response.mapper'

@ApiTags('Proxies')
@UseGuards(PermissionsGuard)
@RequirePermissions('platform:admin')
@Controller('v1/proxies')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    @Post()
    @ApiOperation({ summary: 'Create a proxy' })
    @ApiCreatedResponse({ type: ProxyDto })
    async createProxy(@Body() dto: CreateProxyDto): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.createProxy(dto)))
    }

    @Get()
    @SerializeOptions({ type: ProxyListDto })
    @ApiOperation({ summary: 'List proxies' })
    @ApiOkResponse({ type: ProxyListDto })
    async listProxies(@Query(new ValidationPipe({ transform: true })) query: ListProxiesQueryDto): Promise<ProxyListDto> {
        return this.handleErrors(async () => {
            const { proxies, nextPageToken } = await this.proxyService.listProxies(query)
            return toProxyListDto(proxies, nextPageToken)
        })
    }

    @Get('healthy')
    @ApiOperation({ summary: 'Select a healthy proxy for an MX host' })
    @ApiOkResponse({ type: ProxyDto })
    async getHealthyProxy(@Query() query: HealthyProxyQueryDto): Promise<ProxyDto | undefined> {
        const proxy = await this.proxyService.getHealthyProxy(query.mxHost)
        return proxy === undefined ? undefined : toProxyDto(proxy)
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async getProxy(@Param('id') id: string): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.getProxy(id)))
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async updateProxy(@Param('id') id: string, @Body() dto: UpdateProxyDto): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.updateProxy(id, dto)))
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a proxy' })
    @ApiOkResponse({ type: ProxyDto })
    async deleteProxy(@Param('id') id: string): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.deleteProxy(id)))
    }

    @Post(':id/blacklists')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Exclude a proxy for an MX host' })
    @ApiNoContentResponse()
    async reportProxyBlacklist(@Param('id') id: string, @Body() dto: ReportBlacklistDto): Promise<void> {
        await this.handleErrors(() => this.proxyService.reportProxyBlacklist(id, dto))
    }

    private async handleErrors<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation()
        } catch (error) {
            if (error instanceof ProxyNotFoundError) {
                throw new NotFoundException(error.message)
            }
            if (error instanceof ProxyValidationError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }
    }
}
