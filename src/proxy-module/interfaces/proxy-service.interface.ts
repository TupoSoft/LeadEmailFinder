import { CreateProxyDto, ProxyResponse, UpdateProxyDto } from '../dto'
import { FilterQuery } from 'mongoose'
import { Proxy } from '../proxy.schema'

export interface IProxyService {
    get(filter: FilterQuery<Proxy>): Promise<ProxyResponse[]>

    getById(id: string): Promise<ProxyResponse>

    create(createProxyDto: CreateProxyDto): Promise<ProxyResponse>

    update(id: string, updateProxyDto: UpdateProxyDto): Promise<ProxyResponse>

    remove(id: string): Promise<ProxyResponse>

    addToBlacklist(id: string, blacklist: string): Promise<ProxyResponse>
}
