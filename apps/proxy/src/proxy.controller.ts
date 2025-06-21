import { Controller, Get } from '@nestjs/common'
import { ProxyService } from './proxy.service'
import {
    AddProxyRequest,
    AddProxyResponse,
    DeleteProxyRequest,
    DeleteProxyResponse,
    GetHealthyProxyRequest,
    GetHealthyProxyResponse,
    GetProxyRequest,
    GetProxyResponse,
    ListProxiesRequest,
    ListProxiesResponse,
    ProxyServiceController,
    ReportProxyBlacklistRequest,
    ReportProxyBlacklistResponse,
    UpdateProxyRequest,
    UpdateProxyResponse,
} from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { Observable } from 'rxjs'

@Controller()
export class ProxyController implements ProxyServiceController {
    constructor(private readonly proxyService: ProxyService) {}

    async addProxy(request: AddProxyRequest): Promise<AddProxyResponse> {
        return await this.proxyService.addProxy(request)
    }

    listProxies(
        request: ListProxiesRequest,
    ): Promise<ListProxiesResponse> | Observable<ListProxiesResponse> | ListProxiesResponse {
        throw new Error('Method not implemented.')
    }

    getProxy(request: GetProxyRequest): Promise<GetProxyResponse> | Observable<GetProxyResponse> | GetProxyResponse {
        throw new Error('Method not implemented.')
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
