import { Readable } from 'stream'
import { readUntil } from './read-until'
import { describe, expect, it } from '@jest/globals'
import { KILOBYTE } from './constants'

describe('readUntil', () => {
    it('should resolve with matched data when pattern is found', async () => {
        const stream = Readable.from(['hello ', 'world', ' this is a test'])
        const pattern = /world/

        const result = await readUntil(stream, pattern)
        expect(result).toBe('hello world')
    })

    it('should reject if the stream errors', async () => {
        const stream = new Readable({
            read() {
                this.emit('error', new Error('Test error'))
            },
        })

        const pattern = /world/

        await expect(readUntil(stream, pattern)).rejects.toThrow('Stream error: Test error')
    })

    it('should resolve with data up to the match for string pattern', async () => {
        const stream = Readable.from(['abc ', 'def', 'ghi'])
        const pattern = 'def'

        const result = await readUntil(stream, pattern)
        expect(result).toBe('abc def')
    })

    it('should push unmatched data back to the stream', async () => {
        const stream = Readable.from(['mat', 'ch ', 'extra data'])
        const pattern = /match/

        const result = await readUntil(stream, pattern)

        expect(result).toBe('match')

        const remainingData: string[] = []
        for await (const chunk of stream as AsyncIterable<string>) {
            remainingData.push(chunk.toString())
        }

        expect(remainingData.join('')).toBe(' extra data')
    })

    it('should reject if the buffer exceeds the maximum size', async () => {
        const stream = Readable.from(['a'.repeat(KILOBYTE), 'b'.repeat(KILOBYTE)])
        const pattern = /c/

        await expect(readUntil(stream, pattern, KILOBYTE)).rejects.toThrow('Buffer exceeded maximum allowed size.')
    })

    it('should handle empty streams gracefully', async () => {
        const stream = Readable.from([])
        const pattern = /pattern/

        await expect(readUntil(stream, pattern)).resolves.toBe('')
    })
})
