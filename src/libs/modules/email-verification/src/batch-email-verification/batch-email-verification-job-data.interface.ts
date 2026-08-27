import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'

interface BatchEmailVerificationJobOwner {
    organizationId: string
    credentialId: string
}

export type BatchEmailVerificationJobData =
    | ({
          step:
              | BatchEmailVerificationJobStep.Validate
              | BatchEmailVerificationJobStep.Process
              | BatchEmailVerificationJobStep.WaitForChildren
              | BatchEmailVerificationJobStep.UploadResults
          key: string
          bucket: string
      } & BatchEmailVerificationJobOwner)
    | ({
          step: BatchEmailVerificationJobStep.Finish
          resultFilePath: string
      } & BatchEmailVerificationJobOwner)
