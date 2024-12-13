import type { SmtpResponse } from './dto'

export function parseSmtpResponse(rawResponse: string): SmtpResponse {
    const regex = /^(\d{3})(?:[ -](\d\.\d\.\d))? (.+)$/
    const match = regex.exec(rawResponse)

    if (match == null) {
        throw new Error(`Invalid SMTP response: "${rawResponse}"`)
    }

    const [, code, enhancedCode, message] = match

    return {
        code: parseInt(code, 10),
        enhancedCode: enhancedCode !== '' ? enhancedCode : undefined,
        message: message.trim(),
    }
}
