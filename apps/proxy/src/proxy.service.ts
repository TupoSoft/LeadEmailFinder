import { Injectable } from '@nestjs/common'
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
import { CommandBus } from '@nestjs/cqrs'
import { AddProxyCommand } from './add-proxy/add-proxy.command'

@Injectable()
export class ProxyService implements ProxyServiceController {
    constructor(private readonly commandBus: CommandBus) {}

    async addProxy({
        protocol,
        host,
        port,
        auth,
        weight,
        enabled,
        description,
    }: AddProxyRequest): Promise<AddProxyResponse> {
        return await this.commandBus.execute(
            new AddProxyCommand(protocol, host, port, auth, description, weight, enabled),
        )
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

    getHello(): string {
        return 'Hello World!'
    }
}
