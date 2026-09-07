export enum BatchJobStep {
    Validate,
    Process,
    WaitForChildren,
    UploadResults,
    Finish,
}

interface BatchJobOwner {
    organizationId: string
    credentialId: string
}

export type BatchJobData =
    | ({
          step:
              | BatchJobStep.Validate
              | BatchJobStep.Process
              | BatchJobStep.WaitForChildren
              | BatchJobStep.UploadResults
          key: string
          bucket: string
      } & BatchJobOwner)
    | ({
          step: BatchJobStep.Finish
          resultFilePath: string
      } & BatchJobOwner)
