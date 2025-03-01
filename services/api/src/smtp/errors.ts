export class SmtpError extends Error {
    constructor(
        readonly code: number,
        readonly enhancedCode = '',
        message: string,
    ) {
        super(message)
    }
}

export class SmtpClientTimeoutError extends Error {
    constructor() {
        super(`The client timed out`)
    }
}
