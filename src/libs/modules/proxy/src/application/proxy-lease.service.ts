import { randomUUID } from 'node:crypto'
import { IProxyLeaseService, ProxyLease, ProxyLeaseRequest } from '../domain/proxy-lease.interface'
import { ProxyLeaseStore } from './ports/proxy-lease-store'

export class ProxyLeaseService implements IProxyLeaseService {
    constructor(
        private readonly store: ProxyLeaseStore,
        private readonly mxRequestsPerMinute: number,
        private readonly leaseTtlMs: number,
    ) {}

    async acquire(request: ProxyLeaseRequest): Promise<ProxyLease | undefined> {
        const now = Date.now()
        const leaseId = randomUUID()

        const acquired = await this.store.tryAcquire({
            leaseId,
            proxyId: request.proxyId,
            mxHost: request.mxHost,
            now,
            leaseTtlMs: this.leaseTtlMs,
            maxConcurrent: request.maxConcurrent,
            proxyRequestsPerMinute: request.requestsPerMinute,
            mxRequestsPerMinute: this.mxRequestsPerMinute,
        })

        if (!acquired) {
            return undefined
        }

        return {
            id: leaseId,
            proxyId: request.proxyId,
            mxHost: request.mxHost,
            expiresAt: new Date(now + this.leaseTtlMs),
        }
    }

    async release(lease: ProxyLease): Promise<boolean> {
        return this.store.release(lease.proxyId, lease.mxHost, lease.id)
    }
}
