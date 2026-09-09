import { VerificationJobState } from '../../application/delivery/verification-job-state'

/** Queue-specific values stay at this infrastructure boundary. */
export function normalizeVerificationJobState(state: string): VerificationJobState {
    switch (state) {
        case 'waiting':
        case 'delayed':
        case 'prioritized':
        case 'waiting-children':
        case 'paused':
            return 'queued'
        case 'active':
            return 'running'
        case 'completed':
        case 'failed':
            return state
        default:
            return 'unavailable'
    }
}
