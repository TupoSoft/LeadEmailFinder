export type VerificationExecutionMode = 'sync' | 'async' | 'batch' | 'batch_child'

export interface VerificationTraceContext {
    operationId: string
    mode: VerificationExecutionMode
    jobId?: string
    batchId?: string
    attempt?: number
}
