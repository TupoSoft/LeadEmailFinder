export const PROXY_LEASE_STORE = Symbol('ProxyLeaseStore')

export interface AcquireLeaseCommand {
    readonly leaseId: string
    readonly proxyId: string
    readonly mxHost: string
    readonly now: number
    readonly leaseTtlMs: number
    readonly maxConcurrent: number
    readonly proxyRequestsPerMinute: number
    readonly mxRequestsPerMinute: number
}

export interface ProxyLeaseStore {
    tryAcquire(command: AcquireLeaseCommand): Promise<boolean>

    release(proxyId: string, mxHost: string, leaseId: string): Promise<boolean>
}
