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
import {
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
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

const READ_SECURITY: Record<string, string[]>[] = [{ lef_session: [] }, { oidc: [] }]
const MUTATION_SECURITY: Record<string, string[]>[] = [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }]
const ACCESS_DESCRIPTION = 'Requires platform:admin. Cookie mutations require a valid Origin and CSRF header. '
const SECRET_HEADERS = {
    'Cache-Control': {
        description: 'Prevents storage of every create and update response, including failures.',
        schema: { type: 'string' as const, enum: ['no-store'] },
    },
}

@ApiTags('Proxies')
@UseGuards(PermissionsGuard)
@RequirePermissions('platform:admin')
@Controller('v1/proxies')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    @Post()
    @ApiOperation({
        summary: 'Create a proxy',
        description:
            ACCESS_DESCRIPTION +
            'Defaults to disabled. Authentication is never returned. Reconcile the registry before explicitly retrying an uncertain create.',
        security: MUTATION_SECURITY,
    })
    @ApiCreatedResponse({ type: ProxyDto, headers: SECRET_HEADERS })
    @ApiBadRequestResponse({
        description: 'Invalid proxy fields or incomplete authentication.',
        headers: SECRET_HEADERS,
    })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: SECRET_HEADERS })
    @ApiForbiddenResponse({ description: 'Permission or browser CSRF check denied.', headers: SECRET_HEADERS })
    @ApiInternalServerErrorResponse({
        description: 'Persistence failure; the create outcome may be uncertain.',
        headers: SECRET_HEADERS,
    })
    async createProxy(@Body() dto: CreateProxyDto): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.createProxy(dto)))
    }

    @Get()
    @SerializeOptions({ type: ProxyListDto })
    @ApiOperation({
        summary: 'List proxies',
        description:
            ACCESS_DESCRIPTION +
            'Orders by ID. Pass the returned nextPageToken unchanged; an empty string ends the traversal. No total is provided.',
        security: READ_SECURITY,
    })
    @ApiOkResponse({ type: ProxyListDto })
    @ApiBadRequestResponse({ description: 'Invalid page size or page token.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Permission denied.' })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
    async listProxies(
        @Query(new ValidationPipe({ transform: true })) query: ListProxiesQueryDto,
    ): Promise<ProxyListDto> {
        return this.handleErrors(async () => {
            const { proxies, nextPageToken } = await this.proxyService.listProxies(query)
            return toProxyListDto(proxies, nextPageToken)
        })
    }

    @Get('healthy')
    @ApiOperation({
        summary: 'Select a healthy proxy for an MX host',
        security: READ_SECURITY,
        description: ACCESS_DESCRIPTION,
    })
    @ApiOkResponse({ type: ProxyDto })
    async getHealthyProxy(@Query() query: HealthyProxyQueryDto): Promise<ProxyDto | undefined> {
        const proxy = await this.proxyService.getHealthyProxy(query.mxHost)
        return proxy === undefined ? undefined : toProxyDto(proxy)
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a proxy', security: READ_SECURITY, description: ACCESS_DESCRIPTION })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ type: ProxyDto })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Permission denied.' })
    @ApiNotFoundResponse({ description: 'Proxy not found.' })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
    async getProxy(@Param('id') id: string): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.getProxy(id)))
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Update a proxy',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            'Updates only supplied fields. Omit auth to preserve stored authentication. A redacted read cannot resolve an uncertain authentication replacement; do not retry automatically.',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ type: ProxyDto, headers: SECRET_HEADERS })
    @ApiBadRequestResponse({
        description: 'Empty update or invalid proxy fields, including incomplete authentication.',
        headers: SECRET_HEADERS,
    })
    @ApiUnauthorizedResponse({ description: 'Authentication required.', headers: SECRET_HEADERS })
    @ApiForbiddenResponse({ description: 'Permission or browser CSRF check denied.', headers: SECRET_HEADERS })
    @ApiNotFoundResponse({ description: 'Proxy not found.', headers: SECRET_HEADERS })
    @ApiInternalServerErrorResponse({
        description: 'Persistence failure; authentication may already have changed.',
        headers: SECRET_HEADERS,
    })
    async updateProxy(@Param('id') id: string, @Body() dto: UpdateProxyDto): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.updateProxy(id, dto)))
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a proxy', security: MUTATION_SECURITY, description: ACCESS_DESCRIPTION })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ type: ProxyDto })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Permission or browser CSRF check denied.' })
    @ApiNotFoundResponse({ description: 'Proxy not found.' })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
    async deleteProxy(@Param('id') id: string): Promise<ProxyDto> {
        return this.handleErrors(async () => toProxyDto(await this.proxyService.deleteProxy(id)))
    }

    @Post(':id/blacklists')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Exclude a proxy for an MX host',
        security: MUTATION_SECURITY,
        description:
            ACCESS_DESCRIPTION +
            'Repeated identical reports converge. Read the proxy afterward to see its current blacklist array. Removal is unsupported.',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: 'An MX host is required.' })
    @ApiUnauthorizedResponse({ description: 'Authentication required.' })
    @ApiForbiddenResponse({ description: 'Permission or browser CSRF check denied.' })
    @ApiNotFoundResponse({ description: 'Proxy not found.' })
    @ApiInternalServerErrorResponse({ description: 'Persistence failure.' })
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
