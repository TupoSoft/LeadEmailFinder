export type ProxyLifecycleState = 'active' | 'draining' | 'disabled'

export interface AllocationAcquiredEvent {
    outcome: 'acquired'
    mxHost: string
    proxyId: string
    proxyState: ProxyLifecycleState
    durationMs: number
}

export interface AllocationExhaustedEvent {
    outcome: 'exhausted'
    mxHost: string
    durationMs: number
}

export type AllocationEvent = AllocationAcquiredEvent | AllocationExhaustedEvent

export interface ConnectionOutcomeEvent {
    outcome: 'connected' | 'failed'
    mxHost: string
    proxyId: string
    durationMs: number
}

export interface LeaseReleaseEvent {
    outcome: 'released' | 'failed'
    mxHost: string
    proxyId: string
    durationMs: number
}

export interface IAllocationObserver {
    onAllocation(event: AllocationEvent): void

    onConnectionOutcome(event: ConnectionOutcomeEvent): void

    onLeaseRelease(event: LeaseReleaseEvent): void
}
