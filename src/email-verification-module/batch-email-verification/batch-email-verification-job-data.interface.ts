import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'

export type BatchEmailVerificationJobData =
    | {
          step: BatchEmailVerificationJobStep.Finish | BatchEmailVerificationJobStep.WaitForChildren
      }
    | {
          step: BatchEmailVerificationJobStep.Validate | BatchEmailVerificationJobStep.Process
          key: string
          bucket: string
      }
