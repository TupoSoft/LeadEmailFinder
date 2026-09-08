export const VERIFICATION_JOB_STATES = ['queued', 'running', 'completed', 'failed', 'unavailable'] as const

export type VerificationJobState = (typeof VERIFICATION_JOB_STATES)[number]

export interface VerificationJobSnapshot {
    state: VerificationJobState
}
