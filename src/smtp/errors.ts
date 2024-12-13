export const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    ClientInitiationFailed,
    NoPTR,
    UnknownErrorCode,
    OperationTimeoutOut,
    SenderAddressRejected,
    RecipientAddressRejected,
}

export class SmtpError extends Error {
    constructor(
        readonly code: number,
        readonly enhancedCode = '',
        message: string,
    ) {
        super(message)
    }
}
