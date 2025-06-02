import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'
import { JobState } from './job-state.enum'

export interface EnqueueBatchResponse {
    id: string
}

export interface GetBatchStatusRequestParams {
    id: string
}

export interface GetBatchStatusResponse {
    id: string
    status: JobState
    progress: number
}

export interface BatchEmailVerificationService {
    uploadFile(file: BatchEmailVerificationFile): Promise<EnqueueBatchResponse>
    getBatchStatus(id: string): Promise<GetBatchStatusResponse>
}
