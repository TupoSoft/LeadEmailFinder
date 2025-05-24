export enum SmtpErrorStatusCode {
    MailboxUnavailable = 450,
    RequestedCommandFailed = 451,
    CommandUnrecognized = 500,
    SyntaxError = 501,
    CommandNotImplemented = 502,
    BadSequenceOfCommands = 503,
    CommandParameterNotImplemented = 504,
    MailboxBusy = 550,
    MailboxFull = 552,
    InvalidTransaction = 554,
}

export enum SmtpOkStatusCode {
    ServiceReady = 220,
    ServiceClosingTransmissionChannel = 221,
    OK = 250,
}

export enum SmtpVerificationReason {
    AcceptedEmail = 'accepted_email',
    RejectedEmail = 'rejected_email',
    Timeout = 'timeout',
    TemporarilyBlocked = 'temporarily_blocked',
    NoMxRecords = 'no_mx_records',
    UnexpectedError = 'unexpected_error',
    Blocked = 'blacklisted',
    NoConnect = 'no_connect',
    ExceededStorage = 'exceeded_storage',
    SenderBlocked = 'sender_blocked',
    Unknown = 'unknown',
}
