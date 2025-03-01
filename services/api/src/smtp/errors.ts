import type { SmtpNegativeStatusCode } from './enums'

export interface SmtpErrorConstructorOptions {
    code: SmtpNegativeStatusCode
    enhancedCode: string
    message: string
    targetExchange: string
}

export class SmtpError extends Error {
    readonly code
    readonly enhancedCode
    readonly targetExchange

    constructor({ code, enhancedCode = '', message, targetExchange }: SmtpErrorConstructorOptions) {
        super(message)

        this.code = code
        this.enhancedCode = enhancedCode
        this.targetExchange = targetExchange
    }
}

export class SmtpClientTimeoutError extends Error {
    constructor() {
        super(`The client timed out`)
    }
}
