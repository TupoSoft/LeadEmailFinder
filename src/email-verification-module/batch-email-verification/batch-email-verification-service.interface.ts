import { BatchEmailVerificationFile } from './file.interface'

export interface EnqueueBatchResponse {
    id: string
}

export interface BatchEmailVerificationService {
    enqueueBatch(file: BatchEmailVerificationFile): Promise<EnqueueBatchResponse>
}
