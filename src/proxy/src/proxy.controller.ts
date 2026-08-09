import { Controller, Get, SerializeOptions, UseFilters } from '@nestjs/common'
import { ProxyService } from './proxy.service'
import {
    AddProxyRequest,
    AddProxyResponse,
    DeleteProxyRequest,
    DeleteProxyResponse,
    GetHealthyProxyRequest,
    GetHealthyProxyResponse,
    GetProxyResponse,
    ListProxiesRequest,
    ListProxiesResponse,
    ProxyServiceController,
    ProxyServiceControllerMethods,
    ReportProxyBlacklistRequest,
    ReportProxyBlacklistResponse,
    UpdateProxyRequest,
    UpdateProxyResponse,
} from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AddProxyResponseDto, GetProxyRequestDto, GetProxyResponseDto, ListProxiesResponseDto } from './proxy.dto'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'

@Controller()
@ProxyServiceControllerMethods()
@UseFilters(new HttpToGrpcExceptionFilter())
export class ProxyController implements ProxyServiceController {
    constructor(private readonly proxyService: ProxyService) {}

    @SerializeOptions({ type: AddProxyResponseDto })
    async addProxy(request: AddProxyRequest): Promise<AddProxyResponse> {
        return await this.proxyService.addProxy(request)
    }

    @SerializeOptions({ type: ListProxiesResponseDto })
    async listProxies(request: ListProxiesRequest): Promise<ListProxiesResponse> {
        return await this.proxyService.listProxies(request)
    }

    @SerializeOptions({ type: GetProxyResponseDto })
    async getProxy(request: GetProxyRequestDto): Promise<GetProxyResponse> {
        return await this.proxyService.getProxy(request)
    }

    async updateProxy(request: UpdateProxyRequest): Promise<UpdateProxyResponse> {
        return await this.proxyService.updateProxy(request)
    }

    async deleteProxy(request: DeleteProxyRequest): Promise<DeleteProxyResponse> {
        return await this.proxyService.deleteProxy(request)
    }

    async getHealthyProxy(request: GetHealthyProxyRequest): Promise<GetHealthyProxyResponse> {
        return await this.proxyService.getHealthyProxy(request)
    }

    async reportProxyBlacklist(request: ReportProxyBlacklistRequest): Promise<ReportProxyBlacklistResponse> {
        return await this.proxyService.reportProxyBlacklist(request)
    }

    @Get()
    getHello(): string {
        return this.proxyService.getHello()
    }
}
