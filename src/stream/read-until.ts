import type { Readable } from 'node:stream'
import { KILOBYTE } from './constants'
import { on } from 'node:events'

export async function readUntil(
    readable: Readable,
    matchPattern: RegExp | string,
    maxBufferSize = KILOBYTE,
): Promise<string> {
    let buffer = ''
    const pattern = typeof matchPattern === 'string' ? new RegExp(matchPattern) : matchPattern

    for await (const event of on(readable, 'readable', { close: ['end'] })) {
        void event

        buffer = appendChunk(buffer, readable.read())

        validateBufferSize(buffer, maxBufferSize)

        const matchedData = extractMatchedData(buffer, pattern, readable)
        if (matchedData != null) return matchedData
    }

    return ''
}

function appendChunk(buffer: string, chunk: unknown): string {
    if (Buffer.isBuffer(chunk)) return buffer + chunk.toString()
    if (typeof chunk === 'string') return buffer + chunk
    return buffer
}

function validateBufferSize(buffer: string, maxSize: number): void {
    if (buffer.length > maxSize) {
        throw new Error('Buffer exceeded maximum allowed size.')
    }
}

function extractMatchedData(buffer: string, pattern: RegExp, readable: Readable): string | null {
    const matchArray = buffer.match(pattern)
    if (matchArray == null) return null

    const [firstMatch] = matchArray
    const firstMatchLastIndex = buffer.indexOf(firstMatch)

    const matchedData = buffer.slice(undefined, firstMatchLastIndex + firstMatch.length)
    const unmatchedData = buffer.slice(firstMatchLastIndex + firstMatch.length)

    readable.pause()
    readable.unshift(unmatchedData)

    return matchedData
}
