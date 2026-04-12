import { SmtpResponse } from './smtp-response.interface'
import { setTimeout } from 'node:timers/promises'

export function parseSmtpResponse(rawResponse: string): SmtpResponse {
    const regex = /^(\d{3})(?: ?(\d\.\d\.\d))? (.+)$/m
    const match = regex.exec(rawResponse)

    if (match == null) {
        throw new Error(`Invalid SMTP response: "${rawResponse}"`)
    }

    const [, code, enhancedCode, message] = match

    return {
        code: parseInt(code, 10),
        enhancedCode,
        message: message.trim(),
    }
}

export async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
    return await Promise.race([promise, setTimeout(timeoutMs).then(async () => await Promise.reject(error))])
}
