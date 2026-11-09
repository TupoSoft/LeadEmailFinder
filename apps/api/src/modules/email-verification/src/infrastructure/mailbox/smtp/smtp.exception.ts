import { SmtpErrorStatusCode } from './smtp.enums'
import { SmtpCommandKind } from './smtp-command-kind'

interface SmtpErrorConstructorOptions {
    code: SmtpErrorStatusCode
    enhancedCode: string
    message: string
    targetExchange: string
    proxyId?: string
    commandKind?: SmtpCommandKind
}

export class SmtpException extends Error {
    name = 'SmtpException'

    readonly code
    readonly enhancedCode
    readonly targetExchange
    readonly proxyId
    readonly commandKind

    constructor({ code, enhancedCode = '', message, targetExchange, proxyId, commandKind }: SmtpErrorConstructorOptions) {
        super(message)

        this.code = code
        this.enhancedCode = enhancedCode
        this.targetExchange = targetExchange
        this.proxyId = proxyId
        this.commandKind = commandKind
    }
}
