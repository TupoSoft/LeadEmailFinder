export enum EmailVerificationReason {
    AcceptedEmail = 'accepted_email',
    RejectedEmail = 'rejected_email',
    Timeout = 'timeout',
    TemporarilyBlocked = 'temporarily_blocked',
    NoMxRecords = 'no_mx_records',
    UnexpectedError = 'unexpected_error',
    Blacklisted = 'blacklisted',
    NoConnect = 'no_connect',
    ExceededStorage = 'exceeded_storage',
    SenderBlocked = 'sender_blocked',
    Webmail = 'webmail',
    Unknown = 'unknown',
}
