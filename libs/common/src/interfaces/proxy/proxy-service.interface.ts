import { FilterQuery } from 'mongoose'
import { IProxy } from './proxy.interface'
import { ICreateProxyDto } from './create-proxy-dto.interface'
import { IUpdateProxyDto } from './update-proxy-dto.interface'

export interface IProxyService {
    get(filter: FilterQuery<IProxy>): Promise<IProxy[]>

    getById(id: string): Promise<IProxy>

    create(createProxyDto: ICreateProxyDto): Promise<IProxy>

    update(id: string, updateProxyDto: IUpdateProxyDto): Promise<IProxy>

    remove(id: string): Promise<IProxy>

    addToBlacklist(id: string, blacklist: string): Promise<IProxy>
}
