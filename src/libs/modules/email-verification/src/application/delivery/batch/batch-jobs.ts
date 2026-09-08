import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'

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

export interface BatchJobHandle {
    readonly id: string
    readonly data: BatchJobData
    readonly queueQualifiedName: string
    readonly attemptsMade: number
    state(): Promise<string>
    counts(): Promise<BatchJobCounts>
    returnValue(): Promise<string | undefined>
    updateStep(next: BatchJobData): Promise<void>
}

export interface BatchJobs {
    enqueue(data: NewBatchJob, jobId: string): Promise<{ id?: string }>
    find(id: string): Promise<BatchJobHandle | undefined>
}
