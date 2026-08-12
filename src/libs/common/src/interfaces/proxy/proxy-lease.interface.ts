export interface ProxyLeaseRequest {
    proxyId: string
    mxHost: string
    maxConcurrent: number
    requestsPerMinute: number
}

export interface ProxyLease {
    id: string
    proxyId: string
    mxHost: string
    expiresAt: Date
}

export interface IProxyLeaseService {
    acquire(request: ProxyLeaseRequest): Promise<ProxyLease | undefined>

    release(lease: ProxyLease): Promise<boolean>
}
