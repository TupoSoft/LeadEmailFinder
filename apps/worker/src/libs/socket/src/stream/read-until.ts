import type { Readable } from 'node:stream'
import { KILOBYTE } from './constants'
import { on } from 'node:events'

export async function readUntil(
    readable: Readable,
    matchPattern: RegExp | string,
    maxBufferSize = KILOBYTE,
    signal?: AbortSignal,
): Promise<string> {
    let buffer = ''
    const pattern = typeof matchPattern === 'string' ? new RegExp(matchPattern) : matchPattern

    signal?.throwIfAborted()

    const events = on(readable, 'readable', { close: ['end', 'close'], signal })

    try {
        while (true) {
            // A socket may already have buffered its reply before the caller starts reading.
            let chunk: unknown

            while ((chunk = readable.read()) !== null) {
                buffer = appendChunk(buffer, chunk)
                validateBufferSize(buffer, maxBufferSize)

                const matchedData = extractMatchedData(buffer, pattern, readable)
                if (matchedData != null) {
                    return matchedData
                }
            }

            if (readable.readableEnded || readable.destroyed) {
                return ''
            }

            const event = await events.next()
            if (event.done) {
                return ''
            }
        }
    } finally {
        await events.return?.()
    }
}

function appendChunk(buffer: string, chunk: unknown): string {
    if (Buffer.isBuffer(chunk)) {
        return buffer + chunk.toString()
    }

    if (typeof chunk === 'string') {
        return buffer + chunk
    }

    return buffer
}

function validateBufferSize(buffer: string, maxSize: number): void {
    if (Buffer.byteLength(buffer, 'utf8') > maxSize) {
        throw new Error('Buffer exceeded maximum allowed size.')
    }
}

function extractMatchedData(buffer: string, pattern: RegExp, readable: Readable): string | null {
    const matchArray = buffer.match(pattern)
    if (matchArray == null) {
        return null
    }

    const [firstMatch] = matchArray
    const matchStartIndex = buffer.indexOf(firstMatch)

    const matchedData = buffer.slice(undefined, matchStartIndex + firstMatch.length)
    const unmatchedData = buffer.slice(matchStartIndex + firstMatch.length)

    readable.pause()

    if (unmatchedData.length > 0) {
        readable.unshift(unmatchedData)
    }

    return matchedData
}
