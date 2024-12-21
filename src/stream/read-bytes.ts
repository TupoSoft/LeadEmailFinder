import type { Readable } from 'node:stream'
import { EMPTY_ARRAY_LENGTH, FIRST_ARRAY_ELEMENT_INDEX, ZERO } from '../common/constants'
import { ok } from 'node:assert'

export async function readBytes(readable: Readable, size: number): Promise<Buffer> {
    ok(size > ZERO, new Error(`Invalid size: ${size}. Size must be a positive number.`))

    return await new Promise<Buffer>((resolve, reject) => {
        let buffer = Buffer.alloc(EMPTY_ARRAY_LENGTH)

        const cleanup = (): void => {
            readable.off('data', onData)
            readable.off('error', onError)
            readable.off('end', onEnd)
        }

        const onData = (chunk: Buffer): void => {
            buffer = Buffer.concat([buffer, chunk])

            if (buffer.length >= size) {
                const matchedBytes = buffer.subarray(FIRST_ARRAY_ELEMENT_INDEX, size)
                const unmatchedBytes = buffer.subarray(size)

                cleanup()

                readable.pause()
                readable.unshift(unmatchedBytes)

                resolve(matchedBytes)
            }
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(new Error(`Stream error: ${err.message}`))
        }

        const onEnd = (): void => {
            cleanup()

            if (buffer.length < size) {
                reject(
                    new Error(
                        `Stream ended before reading the required ${size} bytes. Only ${buffer.length} bytes were available.`,
                    ),
                )
            } else {
                resolve(buffer)
            }
        }

        if (readable.isPaused()) {
            readable.resume()
        }

        readable.on('data', onData)
        readable.on('error', onError)
        readable.on('end', onEnd)
    })
}
