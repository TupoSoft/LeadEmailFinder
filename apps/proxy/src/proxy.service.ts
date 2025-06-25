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
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AddProxyCommand } from './commands/add-proxy.command'
import { GetProxyQuery } from './queries/get-proxy.query'
import { ListProxiesQuery } from './queries/list-proxies.query'

@Injectable()
export class ProxyService implements ProxyServiceController {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
    ) {}

    async getProxy({ id }: GetProxyRequest): Promise<GetProxyResponse> {
        return await this.queryBus.execute(new GetProxyQuery(id))
    }

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

    async listProxies({ pageSize, pageToken }: ListProxiesRequest): Promise<ListProxiesResponse> {
        return this.queryBus.execute(new ListProxiesQuery(pageSize, pageToken))
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
