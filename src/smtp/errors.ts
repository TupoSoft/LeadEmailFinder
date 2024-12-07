import type { MxRecord } from 'node:dns'

export const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    ClientInitiationFailed,
    NoPTR,
    UnknownErrorCode,
    OperationTimeoutOut,
    SenderAddressRejected,
    RecipientAddressRejected,
}

export class SMTPClientError extends Error {
    name = 'SMTPClientError'

    constructor(
        readonly code: number,
        message?: string,
    ) {
        super(message)
    }
}

export class SMTPSessionInitiationFailedError extends SMTPClientError {
    name = 'SMTPSessionInitiationFailedError'

    constructor(readonly mxRecords: MxRecord[]) {
        super(SMTPClientErrorCode.SessionInitiationFailed, 'None of MX records accepted connection.')
    }
}

export class SMTPVerificationAborted extends Error {
    name = 'SMTPVerificationAborted'

    constructor(email: string) {
        super(`SMTP verification has been aborted for email ${email}`)
    }
}
