export const ASYNC_VERIFICATION_JOBS = Symbol('AsyncVerificationJobs')

export interface AsyncVerificationJobData {
    email: string
    organizationId: string
    credentialId: string
}

export interface AsyncVerificationJob {
    organizationId: string
    readStatus(): Promise<AsyncVerificationSnapshot>
}

export interface AsyncVerificationSnapshot extends VerificationJobSnapshot {
    result?: unknown
}

export interface AsyncVerificationJobs {
    enqueue(data: AsyncVerificationJobData, jobId: string): Promise<{ id?: string }>
    find(id: string): Promise<AsyncVerificationJob | undefined>
}
import { VerificationJobSnapshot } from '../verification-job-state'
