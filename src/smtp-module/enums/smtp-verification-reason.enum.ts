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
