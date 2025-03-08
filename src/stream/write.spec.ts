import { Writable } from 'node:stream'
import { write } from './write'
import { describe, expect, it } from '@jest/globals'

describe('write', () => {
    it('should resolve when data is written successfully', async () => {
        const stream = new Writable({
            write: (chunk, encoding, cb?) => {
                if (cb !== undefined && typeof cb === 'function') {
                    cb(null)
                }
            },
        })

        await expect(write(stream, 'test data')).resolves.toBeUndefined()
    })

    it('should reject if the stream emits an error during write', async () => {
        const error = new Error('Stream error')

        const stream = new Writable({
            write: () => {
                stream.emit('error', error)
            },
        })

        await expect(write(stream, 'test data')).rejects.toThrowError()
    })

    it('should resolve after the stream drains when `write` returns false', async () => {
        const stream = new Writable({
            write: () => {
                stream.emit('drain')
            },
        })

        await expect(write(stream, 'test data')).resolves.toBeUndefined()
    })

    it('should reject if the stream is already destroyed', async () => {
        const stream = new Writable()
        stream.destroy()

        await expect(write(stream, 'test data')).rejects.toThrow('Stream is already closed or ended.')
    })

    it('should reject if the stream is writableEnded', async () => {
        const stream = new Writable()
        stream.end()

        await expect(write(stream, 'test data')).rejects.toThrow('Stream is already closed or ended.')
    })
})
