import { SmtpResponse } from './smtp-response.interface'

export function parseSmtpResponse(rawResponse: string): SmtpResponse {
    const regex = /^(\d{3})(?: ?(\d\.\d\.\d))? (.+)$/m
    const match = regex.exec(rawResponse)

    if (match == null) {
        throw new Error('smtp_response_invalid')
    }

    const [, code, enhancedCode, message] = match

    return {
        code: parseInt(code, 10),
        enhancedCode,
        message: message.trim(),
    }
}

export async function promiseWithTimeout<T>(
    factory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    error: Error,
): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(error), timeoutMs)
    timer.unref()

    try {
        return await factory(controller.signal)
    } catch (caughtError) {
        throw controller.signal.aborted ? error : caughtError
    } finally {
        clearTimeout(timer)
    }
}
