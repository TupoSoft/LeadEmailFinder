import type { Readable } from 'node:stream'
import { ok } from 'node:assert'
import { on } from 'node:events'

export async function readBytes(readable: Readable, size: number): Promise<Buffer> {
    ok(size > 0, new Error(`Invalid size: ${size}. Size must be a positive number.`))

    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)

    const bufferedChunk: unknown = readable.read(size)
    if (Buffer.isBuffer(bufferedChunk)) {
        buffer = mergeBuffers(buffer, bufferedChunk, size, readable)
    }

    if (buffer.length >= size) {
        return buffer
    }

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
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])

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
