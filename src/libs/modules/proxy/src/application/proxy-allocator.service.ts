import { IAllocationObserver } from '../domain/allocation-observer.interface'
import { IProxyAllocator, LeasedProxy } from '../domain/proxy-allocator.interface'
import { IProxyLeaseService } from '../domain/proxy-lease.interface'
import { ProxyCandidate, ProxyCandidateRepository } from './ports/proxy-candidate-repository'

export class ProxyAllocatorService implements IProxyAllocator {
    constructor(
        private readonly candidateRepository: ProxyCandidateRepository,
        private readonly proxyLeaseService: IProxyLeaseService,
        private readonly observer: IAllocationObserver,
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
                this.observe(() =>
                    this.observer.onAllocation({
                        outcome: 'acquired',
                        mxHost,
                        proxyId: candidate.proxy.id,
                        proxyState: 'active',
                        durationMs: Date.now() - startedAt,
                    }),
                )

                return { proxy: candidate.proxy, lease }
            }
        }

        this.observe(() => this.observer.onAllocation({ outcome: 'exhausted', mxHost, durationMs: Date.now() - startedAt }))

        return undefined
    }

    async release(allocation: LeasedProxy): Promise<boolean> {
        const startedAt = Date.now()
        const released = await this.proxyLeaseService.release(allocation.lease)

        this.observe(() =>
            this.observer.onLeaseRelease({
                outcome: released ? 'released' : 'failed',
                mxHost: allocation.lease.mxHost,
                proxyId: allocation.proxy.id,
                durationMs: Date.now() - startedAt,
            }),
        )

        return released
    }

    // Observability must never break allocation: a failing observer call is swallowed here.
    private observe(emit: () => void): void {
        try {
            emit()
        } catch {
            // intentionally ignored
        }
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
