import type { SmtpNegativeStatusCode } from './enums'

export interface SmtpErrorConstructorOptions {
    code: SmtpNegativeStatusCode
    enhancedCode: string
    message: string
    targetExchange: string
    proxyId?: string
}

export class SmtpError extends Error {
    readonly code
    readonly enhancedCode
    readonly targetExchange
    readonly proxyId

    constructor({ code, enhancedCode = '', message, targetExchange, proxyId }: SmtpErrorConstructorOptions) {
        super(message)

        this.code = code
        this.enhancedCode = enhancedCode
        this.targetExchange = targetExchange
        this.proxyId = proxyId
    }
}

export class SmtpClientTimeoutError extends Error {
    constructor() {
        super(`The client timed out`)
    }
}
