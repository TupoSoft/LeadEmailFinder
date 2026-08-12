import { IProxy } from './proxy.interface'
import { ProxyLease } from './proxy-lease.interface'

export interface LeasedProxy {
    proxy: IProxy
    lease: ProxyLease
}

export interface IProxyAllocator {
    acquire(mxHost: string, proxyId?: string, excludedProxyIds?: string[]): Promise<LeasedProxy | undefined>

    release(allocation: LeasedProxy): Promise<boolean>
}
