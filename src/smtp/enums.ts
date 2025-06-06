export const enum SmtpPositiveStatusCode {
    OK = 250,
}

export const enum SmtpNegativeStatusCode {
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

export type SmtpStatusCode = SmtpPositiveStatusCode | SmtpNegativeStatusCode
