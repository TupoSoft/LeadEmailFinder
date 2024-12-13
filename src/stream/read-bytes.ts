import type { Readable } from 'node:stream'
import { EMPTY_ARRAY_LENGTH, FIRST_ARRAY_ELEMENT_INDEX } from '../common/constants'

export async function readBytes(readable: Readable, size: number): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
        let buffer = Buffer.alloc(EMPTY_ARRAY_LENGTH)

        const onData = (chunk: Buffer): void => {
            buffer = Buffer.concat([buffer, chunk])

            if (buffer.length === size) {
                readable.off('data', onData)
                readable.off('error', reject)

                resolve(buffer)
            }

            if (buffer.length > size) {
                readable.off('data', onData)
                readable.off('error', reject)

                const matchedBytes = buffer.subarray(FIRST_ARRAY_ELEMENT_INDEX, size)
                const unmatchedBytes = buffer.subarray(size)

                readable.unshift(unmatchedBytes)

                resolve(matchedBytes)
            }
        }

        readable.on('data', onData)
        readable.on('error', reject)
    })
}
