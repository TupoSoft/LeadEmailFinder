import { describe, expect, test } from '@jest/globals'
import { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { readBytes } from './read-bytes'
import { ZERO } from '../common/constants'

describe('readBytes', () => {
    test('should throw an error if the size is zero or negative', async () => {
        const readable = Readable.from('tuposoft')

        await expect(readBytes(readable, ZERO)).rejects.toThrow(
            `Invalid size: ${ZERO}. Size must be a positive number.`,
        )

        const negativeSize = -5
        await expect(readBytes(readable, negativeSize)).rejects.toThrow(
            `Invalid size: ${negativeSize}. Size must be a positive number.`,
        )
    })

    test('should read the required number of bytes from the stream', async () => {
        const size = 0x04
        const readable = Readable.from(Buffer.from('tuposoft'))

        const result = await readBytes(readable, size)

        expect(result.toString()).toBe('tupo')
    })

    test('should reject if the stream ends before reading the required bytes', async () => {
        const size = 8
        const readable = Readable.from(Buffer.from('tupo'))

        await expect(readBytes(readable, size)).rejects.toThrow(
            'Stream ended before reading the required 8 bytes. Only 4 bytes were available.',
        )
    })

    test('should handle stream errors gracefully', async () => {
        const readable = new Readable({
            read() {
                this.destroy(new Error('Stream error occurred'))
            },
        })

        const size = 5
        await expect(readBytes(readable, size)).rejects.toThrow('Stream error: Stream error occurred')
    })

    test('should return remaining bytes to the stream when exceeding required size', async () => {
        const size = 4
        const readable = new Readable({
            read() {
                this.push(Buffer.from('tuposoft'))
                this.push(null)
            },
        })

        const result = await readBytes(readable, size)

        expect(result.toString()).toBe('tupo')

        const remainingData: string[] = []
        for await (const item of readable as AsyncIterable<Buffer>) {
            remainingData.push(item.toString())
        }

        expect(remainingData.join()).toBe('soft')
    })
})
