import { BadRequestException, Injectable } from '@nestjs/common'
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
import { InjectModel } from '@nestjs/mongoose'
import { Proxy } from './proxy.schema'
import { Model, Types } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyDescriptorDto } from './proxy.dto'
import { ProxyNotFoundException } from './proxy-not-found.exception'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100

@Injectable()
export class ProxyService implements ProxyServiceController {
    constructor(
        private readonly commandBus: CommandBus,
        @InjectModel(Proxy.name) private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async getProxy({ id }: GetProxyRequest): Promise<GetProxyResponse> {
        if (!Types.ObjectId.isValid(id)) {
            throw new ProxyNotFoundException(id)
        }

        const proxy = await this.proxyModel.findById(id).exec()

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        return {
            proxy: this.mapper.map(proxy, Proxy, ProxyDescriptorDto),
        }
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
        const resolvedPageSize = Math.min(Math.max(pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
        const filter: { _id?: { $gt: Types.ObjectId } } = {}

        if (pageToken !== undefined) {
            if (!Types.ObjectId.isValid(pageToken)) {
                throw new BadRequestException('Invalid page token.')
            }

            filter._id = { $gt: new Types.ObjectId(pageToken) }
        }

        const proxies = await this.proxyModel
            .find(filter)
            .sort({ _id: 1 })
            .limit(resolvedPageSize + 1)
            .exec()
        const hasNextPage = proxies.length > resolvedPageSize
        const page = hasNextPage ? proxies.slice(0, resolvedPageSize) : proxies

        return {
            proxies: this.mapper.mapArray(page, Proxy, ProxyDescriptorDto),
            nextPageToken: hasNextPage ? page.at(-1)!._id.toHexString() : '',
        }
    }

    updateProxy(
        _request: UpdateProxyRequest,
    ): Promise<UpdateProxyResponse> | Observable<UpdateProxyResponse> | UpdateProxyResponse {
        throw new Error('Method not implemented.')
    }

    deleteProxy(
        _request: DeleteProxyRequest,
    ): Promise<DeleteProxyResponse> | Observable<DeleteProxyResponse> | DeleteProxyResponse {
        throw new Error('Method not implemented.')
    }

    getHealthyProxy(
        _request: GetHealthyProxyRequest,
    ): Promise<GetHealthyProxyResponse> | Observable<GetHealthyProxyResponse> | GetHealthyProxyResponse {
        throw new Error('Method not implemented.')
    }

    reportProxyBlacklist(
        _request: ReportProxyBlacklistRequest,
    ): Promise<ReportProxyBlacklistResponse> | Observable<ReportProxyBlacklistResponse> | ReportProxyBlacklistResponse {
        throw new Error('Method not implemented.')
    }

    getHello(): string {
        return 'Hello World!'
    }
}
