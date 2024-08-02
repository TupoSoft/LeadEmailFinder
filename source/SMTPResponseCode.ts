export enum SMTPResponseCode {
    // 2xx: Success
    SERVICE_READY = 220,
    SERVICE_CLOSING_TRANSMISSION_CHANNEL = 221,
    OK = 250,                // Requested mail action okay, completed.
    MAIL_ACTION_OK = 251,    // User not local; will forward to <forward-path>.

    // 3xx: Positive Completion
    READY_FOR_MORE_INFO = 354, // Start mail input; end with <CRLF>.<CRLF>.

    // 4xx: Temporary Failures
    TEMPORARY_FAILURE = 421,     // Service not available, closing transmission channel.
    MAILBOX_UNAVAILABLE = 450,   // Requested mail action not taken: mailbox unavailable.
    PROCESSING_ABORTED = 451,    // Requested action aborted: error in processing.
    INSUFFICIENT_STORAGE = 452,   // Requested action not taken: insufficient storage space.

    // 5xx: Permanent Failures
    SYNTAX_ERROR = 500,          // Syntax error, command unrecognized.
    COMMAND_NOT_IMPLEMENTED = 502, // Command not implemented.
    BAD_SEQUENCE = 503,           // Bad sequence of commands.
    NOT_AUTHORIZED = 530,         // Authentication required.
    MAILBOX_NOT_FOUND = 550,      // Requested action not taken: mailbox unavailable.
    USER_NOT_LOCAL = 551,         // User not local; please try <forward-path>.
    UNAVAILABLE = 552,            // Requested mail action aborted: exceeded storage allocation.
    UNKNOWN_ERROR = 553,          // Requested action not taken: mailbox name not allowed.
    TRANSACTION_FAILED = 554,     // Transaction failed.
}