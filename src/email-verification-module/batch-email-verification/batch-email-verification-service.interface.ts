import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'

export interface EnqueueBatchResponse {
    id: string
}

export interface BatchEmailVerificationService {
    uploadFile(file: BatchEmailVerificationFile): Promise<EnqueueBatchResponse>
}
