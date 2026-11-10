import { createConnectionDeadline } from './connection-deadline'
import { ConnectionTimeoutError } from './connection-timeout.error'

function fakeSocket(): { destroy: jest.Mock; destroyed: boolean } {
    const socket = {
        destroyed: false,
        destroy: jest.fn(() => {
            socket.destroyed = true
        }),
    }
    return socket
}

describe('createConnectionDeadline', () => {
    it('has no signal and never destroys when no timeout or caller signal is given', async () => {
        const deadline = createConnectionDeadline({ host: 'mx.example.com', port: 25 })
        const socket = fakeSocket()

        expect(deadline.signal).toBeUndefined()

        deadline.track(socket as never)
        await new Promise(resolve => setTimeout(resolve, 20))

        expect(socket.destroy).not.toHaveBeenCalled()
        deadline.clear()
    })

    it('destroys the tracked socket and normalizes the error when the deadline fires', async () => {
        const deadline = createConnectionDeadline({ host: 'mx.example.com', port: 25, timeout: 10 })
        const socket = fakeSocket()
        deadline.track(socket as never)

        await new Promise(resolve => setTimeout(resolve, 30))

        expect(socket.destroy).toHaveBeenCalledTimes(1)
        expect(socket.destroy).toHaveBeenCalledWith(expect.any(ConnectionTimeoutError))

        const caughtError = new Error('some downstream rejection')
        expect(deadline.normalizeError(caughtError)).toBeInstanceOf(ConnectionTimeoutError)

        deadline.clear()
    })

    it('destroys the tracked socket with the caller-abort reason and leaves the error untouched', async () => {
        const controller = new AbortController()
        const reason = new Error('caller aborted')
        const deadline = createConnectionDeadline({
            host: 'mx.example.com',
            port: 25,
            timeout: 1000,
            signal: controller.signal,
        })
        const socket = fakeSocket()
        deadline.track(socket as never)

        controller.abort(reason)
        await Promise.resolve()

        expect(socket.destroy).toHaveBeenCalledWith(reason)

        const caughtError = new Error('some downstream rejection')
        expect(deadline.normalizeError(caughtError)).toBe(caughtError)

        deadline.clear()
    })

    it('never destroys after clear(), even past the configured timeout', async () => {
        const deadline = createConnectionDeadline({ host: 'mx.example.com', port: 25, timeout: 10 })
        const socket = fakeSocket()
        deadline.track(socket as never)

        deadline.clear()
        await new Promise(resolve => setTimeout(resolve, 30))

        expect(socket.destroy).not.toHaveBeenCalled()
    })

    it('destroys immediately when tracked after the signal has already aborted', async () => {
        const deadline = createConnectionDeadline({ host: 'mx.example.com', port: 25, timeout: 10 })
        await new Promise(resolve => setTimeout(resolve, 30))

        const socket = fakeSocket()
        deadline.track(socket as never)

        expect(socket.destroy).toHaveBeenCalledTimes(1)
        deadline.clear()
    })
})
