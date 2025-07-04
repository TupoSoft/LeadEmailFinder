import { Controller, Get, NotFoundException, SerializeOptions, UseFilters } from '@nestjs/common'
import { ProxyService } from './proxy.service'
import {
    AddProxyResponse,
    DeleteProxyRequest,
    DeleteProxyResponse,
    GetHealthyProxyRequest,
    GetHealthyProxyResponse,
    GetProxyResponse,
    ListProxiesResponse,
    ProxyServiceController,
    ProxyServiceControllerMethods,
    ReportProxyBlacklistRequest,
    ReportProxyBlacklistResponse,
    UpdateProxyRequest,
    UpdateProxyResponse,
} from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { Observable } from 'rxjs'
import {
    AddProxyRequestDto,
    AddProxyResponseDto,
    GetProxyRequestDto,
    GetProxyResponseDto,
    ListProxiesRequestDto,
    ListProxiesResponseDto,
} from './proxy.dto'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'
import { ProxyNotFoundException } from './proxy-not-found.exception'

@Controller()
@ProxyServiceControllerMethods()
@UseFilters(new HttpToGrpcExceptionFilter())
export class ProxyController implements ProxyServiceController {
    constructor(private readonly proxyService: ProxyService) {}

    @SerializeOptions({ type: AddProxyResponseDto })
    async addProxy(request: AddProxyRequestDto): Promise<AddProxyResponse> {
        return await this.proxyService.addProxy(request)
    }

    @SerializeOptions({ type: ListProxiesResponseDto })
    async listProxies(request: ListProxiesRequestDto): Promise<ListProxiesResponse> {
        return await this.proxyService.listProxies(request)
    }

    @SerializeOptions({ type: GetProxyResponseDto })
    async getProxy(request: GetProxyRequestDto): Promise<GetProxyResponse> {
        try {
            return await this.proxyService.getProxy(request)
        } catch (e) {
            if (e instanceof ProxyNotFoundException) {
                throw new NotFoundException(e)
            }

            throw e
        }
    }

    updateProxy(
        request: UpdateProxyRequest,
    ): Promise<UpdateProxyResponse> | Observable<UpdateProxyResponse> | UpdateProxyResponse {
        return this.proxyService.updateProxy(request)
    }

    deleteProxy(
        request: DeleteProxyRequest,
    ): Promise<DeleteProxyResponse> | Observable<DeleteProxyResponse> | DeleteProxyResponse {
        return this.proxyService.deleteProxy(request)
    }

    getHealthyProxy(
        request: GetHealthyProxyRequest,
    ): Promise<GetHealthyProxyResponse> | Observable<GetHealthyProxyResponse> | GetHealthyProxyResponse {
        return this.proxyService.getHealthyProxy(request)
    }

    reportProxyBlacklist(
        request: ReportProxyBlacklistRequest,
    ): Promise<ReportProxyBlacklistResponse> | Observable<ReportProxyBlacklistResponse> | ReportProxyBlacklistResponse {
        return this.proxyService.reportProxyBlacklist(request)
    }

    @Get()
    getHello(): string {
        return this.proxyService.getHello()
    }
}
