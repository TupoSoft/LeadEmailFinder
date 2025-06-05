export enum BatchEmailVerificationJobStep {
    Validate,
    Process,
    WaitForChildren,
    UploadResults,
    Finish,
}
