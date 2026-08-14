import { Inject, Injectable } from '@nestjs/common'
import {
    ALLOCATION_OBSERVER_TOKEN,
    IAllocationObserver,
    IProxyAllocator,
    IProxyLeaseService,
    LeasedProxy,
    PROXY_LEASE_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'
import {
    PROXY_CANDIDATE_REPOSITORY_TOKEN,
    ProxyCandidate,
    ProxyCandidateRepository,
} from './proxy-candidate.repository'


@Injectable()
export class ProxyAllocatorService implements IProxyAllocator {
    constructor(
        @Inject(PROXY_CANDIDATE_REPOSITORY_TOKEN) private readonly candidateRepository: ProxyCandidateRepository,
        @Inject(PROXY_LEASE_SERVICE_TOKEN) private readonly proxyLeaseService: IProxyLeaseService,
        @Inject(ALLOCATION_OBSERVER_TOKEN) private readonly observer: IAllocationObserver,
    ) {}

    async acquire(mxHost: string, proxyId?: string, excludedProxyIds: string[] = []): Promise<LeasedProxy | undefined> {
        const startedAt = Date.now()
        const candidates = proxyId == null
            ? await this.candidateRepository.findEligible(mxHost, excludedProxyIds)
            : await this.getExplicitCandidate(mxHost, proxyId, excludedProxyIds)

        for (const candidate of orderByWeight(candidates)) {
            const lease = await this.proxyLeaseService.acquire({
                proxyId: candidate.proxy.id,
                mxHost,
                maxConcurrent: candidate.maxConcurrent,
                requestsPerMinute: candidate.requestsPerMinute,
            })

            if (lease !== undefined) {
                this.observer.onAllocation({
                    outcome: 'acquired',
                    mxHost,
                    proxyId: candidate.proxy.id,
                    proxyState: 'active',
                    durationMs: Date.now() - startedAt,
                })

                return { proxy: candidate.proxy, lease }
            }
        }

        this.observer.onAllocation({ outcome: 'exhausted', mxHost, durationMs: Date.now() - startedAt })

        return undefined
    }

    async release(allocation: LeasedProxy): Promise<boolean> {
        const startedAt = Date.now()
        const released = await this.proxyLeaseService.release(allocation.lease)

        this.observer.onLeaseRelease({
            outcome: released ? 'released' : 'failed',
            mxHost: allocation.lease.mxHost,
            proxyId: allocation.proxy.id,
            durationMs: Date.now() - startedAt,
        })

        return released
    }

    private async getExplicitCandidate(
        mxHost: string,
        proxyId: string,
        excludedProxyIds: string[],
    ): Promise<ProxyCandidate[]> {
        if (excludedProxyIds.includes(proxyId)) {
            return []
        }

        const candidate = await this.candidateRepository.findActiveById(mxHost, proxyId)
        return candidate === undefined ? [] : [candidate]
    }
}

function orderByWeight(candidates: ProxyCandidate[]): ProxyCandidate[] {
    const remaining = [...candidates]
    const ordered: ProxyCandidate[] = []

    while (remaining.length > 0) {
        const totalWeight = remaining.reduce((sum, candidate) => sum + Math.max(candidate.weight, 0), 0)
        const selected = selectWeightedCandidate(remaining, totalWeight)

        ordered.push(selected)
        remaining.splice(remaining.indexOf(selected), 1)
    }

    return ordered
}

function selectWeightedCandidate(candidates: ProxyCandidate[], totalWeight: number): ProxyCandidate {
    if (totalWeight <= 0) {
        return candidates[0]
    }

    let threshold = Math.random() * totalWeight

    for (const candidate of candidates) {
        threshold -= Math.max(candidate.weight, 0)

        if (threshold < 0) {
            return candidate
        }
    }

    return candidates.at(-1)!
}
