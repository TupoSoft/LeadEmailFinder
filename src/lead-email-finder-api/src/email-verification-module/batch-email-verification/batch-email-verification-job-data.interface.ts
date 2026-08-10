import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'

export type BatchEmailVerificationJobData =
    | {
          step:
              | BatchEmailVerificationJobStep.Validate
              | BatchEmailVerificationJobStep.Process
              | BatchEmailVerificationJobStep.WaitForChildren
              | BatchEmailVerificationJobStep.UploadResults
          key: string
          bucket: string
          apiKey: string
      }
    | {
          step: BatchEmailVerificationJobStep.Finish
          resultFilePath: string
      }
