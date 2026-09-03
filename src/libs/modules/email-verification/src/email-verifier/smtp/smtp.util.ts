import { SmtpResponse } from './smtp-response.interface'

export function parseSmtpResponse(rawResponse: string): SmtpResponse {
    const rawLines = rawResponse.trimEnd().split(/\r?\n/)
    const parsedLines = rawLines.map(line => /^(\d{3})([- ])(?:(\d\.\d\.\d)(?: (.*))?|(.*))$/.exec(line))

    if (
        parsedLines.length === 0 ||
        parsedLines.some(match => match == null) ||
        parsedLines.at(-1)?.[2] !== ' ' ||
        parsedLines.slice(0, -1).some(match => match?.[2] !== '-')
    ) {
        throw new Error('smtp_response_invalid')
    }

    const matches = parsedLines as RegExpExecArray[]
    const code = matches[0][1]
    if (matches.some(match => match[1] !== code)) {
        throw new Error('smtp_response_invalid')
    }

    const lines = matches.map(match => (match[4] ?? match[5] ?? '').trim())
    const capabilityLines = lines.length === 1 ? lines : lines.slice(1)
    const capabilities = capabilityLines
        .map(line => /^([A-Z][A-Z0-9-]*)(?:\s|$)/i.exec(line)?.[1].toUpperCase())
        .filter((capability): capability is string => capability !== undefined)
    const finalMatch = matches.at(-1)!

    return {
        code: parseInt(code, 10),
        enhancedCode: finalMatch[3] ?? '',
        message: lines.at(-1)!,
        lines,
        capabilities,
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
