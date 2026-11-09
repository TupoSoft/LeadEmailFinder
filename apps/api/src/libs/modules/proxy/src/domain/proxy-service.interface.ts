import { IProxy } from './proxy.interface'

export interface IProxyService {
    get(excludedExchanges?: string[]): Promise<IProxy[]>

    getById(id: string): Promise<IProxy>

    addToBlacklist(id: string, blacklist: string): Promise<IProxy>
}
