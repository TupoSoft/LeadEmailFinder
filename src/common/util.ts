import type { JobState } from 'bullmq'
import { JobStatus } from './queue-enums'

export function jobStateToJobStatus(state: JobState | 'unknown'): JobStatus {
    switch (state) {
        case 'completed':
            return JobStatus.Completed
        case 'failed':
            return JobStatus.Failed
        case 'active':
            return JobStatus.Active
        case 'delayed':
            return JobStatus.Delayed
        case 'prioritized':
            return JobStatus.Prioritized
        case 'waiting':
            return JobStatus.Waiting
        case 'waiting-children':
            return JobStatus.WaitingChildren
        case 'unknown':
            return JobStatus.Unknown
    }
}
