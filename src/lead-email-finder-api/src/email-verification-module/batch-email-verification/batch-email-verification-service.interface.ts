import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'
import { Readable } from 'node:stream'
import { JobState } from '@tuposoft/lead-email-finder/common'

export interface EnqueueBatchResponse {
    id: string
}

export interface GetBatchStatusRequestParams {
    id: string
}

export interface GetBatchStatusResponse {
    id: string
    status: JobState
    total: number
    processed: number
    unprocessed: number
    progress: number
}

export interface BatchEmailVerificationService {
    uploadFile(file: BatchEmailVerificationFile): Promise<EnqueueBatchResponse>
    getBatchStatus(id: string): Promise<GetBatchStatusResponse>
    getBatchResults(id: string): Promise<Readable>
}
