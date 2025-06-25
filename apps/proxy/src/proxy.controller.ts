import { Controller, Get, NotFoundException, SerializeOptions, UseFilters } from '@nestjs/common'
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
import { Observable } from 'rxjs'
import { AddProxyResponseDto, GetProxyRequestDto, GetProxyResponseDto, ListProxiesResponseDto } from './proxy.dto'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'
import { ProxyNotFoundException } from './proxy-not-found.exception'

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
        throw new Error('Method not implemented.')
    }

    deleteProxy(
        request: DeleteProxyRequest,
    ): Promise<DeleteProxyResponse> | Observable<DeleteProxyResponse> | DeleteProxyResponse {
        throw new Error('Method not implemented.')
    }

    getHealthyProxy(
        request: GetHealthyProxyRequest,
    ): Promise<GetHealthyProxyResponse> | Observable<GetHealthyProxyResponse> | GetHealthyProxyResponse {
        throw new Error('Method not implemented.')
    }

    reportProxyBlacklist(
        request: ReportProxyBlacklistRequest,
    ): Promise<ReportProxyBlacklistResponse> | Observable<ReportProxyBlacklistResponse> | ReportProxyBlacklistResponse {
        throw new Error('Method not implemented.')
    }

    @Get()
    getHello(): string {
        return this.proxyService.getHello()
    }
}
