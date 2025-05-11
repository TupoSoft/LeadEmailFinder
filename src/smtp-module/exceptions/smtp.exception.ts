import { SmtpErrorStatusCode } from '../enums'

interface SmtpErrorConstructorOptions {
    code: SmtpErrorStatusCode
    enhancedCode: string
    message: string
    targetExchange: string
    proxyId?: string
}

export class SmtpException extends Error {
    name = 'SmtpException'

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
