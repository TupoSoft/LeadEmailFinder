export const VERIFICATION_EXECUTION_QUEUE_NAME = 'verification-execution'
export const VERIFICATION_EXECUTION_JOB_NAME = 'verification-execution'

/** Version marker on this queue's own job payload only — unrelated to, and never shared with, the existing
 *  `async-email-verification` queue's batch-child payload, which this plan does not touch. */
export const VERIFICATION_EXECUTION_PAYLOAD_VERSION = 1

export interface VerificationExecutionJobData {
    readonly v: typeof VERIFICATION_EXECUTION_PAYLOAD_VERSION
    readonly executionId: string
    readonly organizationId: string
}

const PERMIT_UNAVAILABLE_RETRY_MS = 250

export const VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS = {
    attempts: 10,
    backoff: { type: 'verification-execution' },
    // Durable state lives entirely in the Postgres execution row, not the BullMQ job record — the same job ID
    // (the execution ID) is deliberately reused across attempts, so completed/failed job records must not block
    // a later dispatch from reusing it.
    removeOnComplete: true,
    removeOnFail: true,
}

export function verificationExecutionBackoff(_attemptsMade: number, type?: string): number {
    if (type === 'verification-execution') return PERMIT_UNAVAILABLE_RETRY_MS
    throw new Error(`Unknown type: ${type}`)
}
