import type { Readable } from 'node:stream'
import { EMPTY_ARRAY_LENGTH, isEmptyArray, ZERO } from '../common'
import { ok } from 'node:assert'
import { on } from 'node:events'

export async function readBytes(readable: Readable, size: number): Promise<Buffer> {
    ok(size > ZERO, new Error(`Invalid size: ${size}. Size must be a positive number.`))

    let buffer = Buffer.alloc(EMPTY_ARRAY_LENGTH)
    for await (const event of on(readable, 'readable', { close: ['end'] })) {
        void event

        const chunk: unknown = readable.read(size)

        if (Buffer.isBuffer(chunk)) {
            buffer = mergeBuffers(buffer, chunk, size, readable)
        }

        if (buffer.length >= size) break
    }

    validateBufferSize(buffer, size)

    return buffer
}

function mergeBuffers(buffer: Buffer, chunk: Buffer, size: number, readable: Readable): Buffer {
    buffer = isEmptyArray(buffer) ? chunk : Buffer.concat([buffer, chunk])

    if (buffer.length >= size) {
        const matchedBytes = buffer.subarray(undefined, size)
        const unmatchedBytes = buffer.subarray(size)

        readable.pause()
        readable.unshift(unmatchedBytes)

        return matchedBytes
    }

    return buffer
}

function validateBufferSize(buffer: Buffer, size: number): void {
    if (buffer.length < size) {
        throw new Error(
            `Stream ended before reading the required ${size} bytes. Only ${buffer.length} bytes were available.`,
        )
    }
}
