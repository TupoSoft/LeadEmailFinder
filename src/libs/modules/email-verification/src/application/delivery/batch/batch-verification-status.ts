import { VerificationJobState } from '../verification-job-state'
import { BatchVerificationSnapshot } from './batch-jobs'
import { BatchTerminalFailureCode, safeBatchTerminalFailureCode } from './batch-terminal-failure'

export function mapBatchVerificationStatus(snapshot: BatchVerificationSnapshot): {
    status: VerificationJobState
    failureCode?: BatchTerminalFailureCode
} {
    switch (snapshot.state) {
        case 'queued':
        case 'running':
            return { status: snapshot.state }
        case 'failed':
            return { status: 'failed', failureCode: safeBatchTerminalFailureCode(snapshot.failureCode) }
        case 'completed':
            return {
                status:
                    typeof snapshot.resultLocation === 'string' && snapshot.resultLocation.length > 0
                        ? 'completed'
                        : 'unavailable',
            }
        default:
            return { status: 'unavailable' }
    }
}
