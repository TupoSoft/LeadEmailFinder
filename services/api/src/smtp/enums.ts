export const enum SmtpPositiveStatusCode {
    ServiceReady = 220,
    ServiceClosingTransmissionChannel = 221,
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
    InvalidTransaction = 554,
}

export type SmtpStatusCode = SmtpPositiveStatusCode | SmtpNegativeStatusCode
