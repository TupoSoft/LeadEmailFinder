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
        this.code = code
    }
}

export class SMTPSessionInitiationFailedError extends SMTPClientError {
    name = 'SMTPSessionInitiationFailedError'

    constructor(readonly mxRecords: MxRecord[]) {
        super(SMTPClientErrorCode.SessionInitiationFailed, 'None of MX records accepted connection.')
    }
}
