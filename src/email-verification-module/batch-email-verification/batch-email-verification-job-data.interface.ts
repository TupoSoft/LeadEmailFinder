import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'

export interface BatchEmailVerificationJobData {
    step: BatchEmailVerificationJobStep
    key: string
    bucket: string
}
