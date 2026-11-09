export class VerificationExecutionPermitUnavailableException extends Error {
    name = 'VerificationExecutionPermitUnavailableException'

    constructor(executionId: string) {
        super(`No execution permit was available for execution ${executionId}`)
    }
}
