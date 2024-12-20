import { Writable } from 'node:stream'
import { write } from './write'
import { describe, expect, it, jest } from '@jest/globals'

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

        await expect(write(stream, 'test data')).rejects.toThrowError(error)
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
        Object.defineProperty(stream, 'writableEnded', { value: true })

        await expect(write(stream, 'test data')).rejects.toThrow('Stream is already closed or ended.')
    })

    it('should properly clean up event listeners on success', async () => {
        const stream = new Writable({
            write: (chunk, encoding, cb?) => {
                if (cb !== undefined) {
                    cb(null)
                }

                return true
            },
        })

        const offSpy = jest.spyOn(stream, 'off')

        await write(stream, 'test data')

        expect(offSpy).toHaveBeenCalledWith('error', expect.any(Function))
        expect(offSpy).toHaveBeenCalledWith('drain', expect.any(Function))
    })

    it('should properly clean up event listeners on error', async () => {
        const error = new Error('Stream error')
        const stream = new Writable({
            write: () => {
                stream.emit('error', error)
            },
        })

        const removeListenerSpy = jest.spyOn(stream, 'off')

        await expect(write(stream, 'test data')).rejects.toThrow(error)

        expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))
        expect(removeListenerSpy).toHaveBeenCalledWith('drain', expect.any(Function))
    })
})
