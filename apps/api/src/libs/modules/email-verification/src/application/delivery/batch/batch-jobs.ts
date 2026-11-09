import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { VerificationJobSnapshot } from '../verification-job-state'

export const BATCH_JOBS = Symbol('BatchJobs')

export interface BatchJobCounts {
    processed: number
    unprocessed: number
}

export interface NewBatchJob {
    step: BatchJobStep.Validate
    bucket: string
    key: string
    organizationId: string
    credentialId: string
}

export interface BatchVerificationSnapshot extends VerificationJobSnapshot {
    /** Only a validated, retained storage location may be supplied by the adapter. */
    resultLocation?: string
    failureCode?: unknown
}

export interface BatchJobHandle {
    readonly id: string
    readonly data: BatchJobData
    readonly queueQualifiedName: string
    readonly attemptsMade: number
    readStatus(): Promise<BatchVerificationSnapshot>
    counts(): Promise<BatchJobCounts>
    updateStep(next: BatchJobData): Promise<void>
}

export interface BatchJobs {
    enqueue(data: NewBatchJob, jobId: string): Promise<{ id?: string }>
    find(id: string): Promise<BatchJobHandle | undefined>
}
