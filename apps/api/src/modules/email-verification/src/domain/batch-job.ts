export enum BatchJobStep {
    Validate,
    Admit,
    Dispatch,
    AwaitSettlement,
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
              | BatchJobStep.Admit
              | BatchJobStep.Dispatch
              | BatchJobStep.AwaitSettlement
              | BatchJobStep.UploadResults
          key: string
          bucket: string
      } & BatchJobOwner)
    | ({
          step: BatchJobStep.Finish
          resultFilePath: string
      } & BatchJobOwner)
