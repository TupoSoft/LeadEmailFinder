export class SmtpClientTimeoutException extends Error {
    name = 'SmtpClientTimeoutException'

    constructor() {
        super(`The client timed out`)
    }
}
