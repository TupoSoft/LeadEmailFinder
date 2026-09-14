import { createServer, Server, Socket } from 'node:net'
import { connect } from './connect'
import { ConnectionTimeoutError } from './connection-timeout.error'

describe('connect', () => {
    let server: Server
    let port: number
    let connection: Socket | undefined
    let proxyConnection: Socket | undefined

    beforeEach(async () => {
        connection = undefined
        proxyConnection = undefined
        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test server')
        }
        port = address.port
    })

    afterEach(async () => {
        jest.useRealTimers()
        connection?.destroy()
        proxyConnection?.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => (error != null ? reject(error) : resolve())))
    })

    function waitForProxyClose(): Promise<void> {
        return new Promise(resolve => {
            server.once('connection', socket => {
                socket.once('close', () => resolve())
            })
        })
    }

    it('connects directly to a responsive server, unaffected by a configured deadline', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
        })

        connection = await connect({ host: '127.0.0.1', port, timeout: 2000 })

        expect(connection.destroyed).toBe(false)
    })

    it('rejects with a typed timeout and destroys the socket when an HTTP CONNECT proxy never responds', async () => {
        const proxyClosed = waitForProxyClose()
        const requestReceived = new Promise<void>(resolve => {
            server.once('connection', socket => {
                proxyConnection = socket
                // Read the CONNECT request, but never answer it.
                socket.once('data', () => resolve())
            })
        })

        jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] })
        const timedOut = expect(
            connect({
                host: 'smtp.lef.test',
                port: 2525,
                timeout: 50,
                proxy: { type: 'http', host: '127.0.0.1', port },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        const settled = jest.fn()
        void timedOut.then(settled, settled)

        await requestReceived
        await jest.advanceTimersByTimeAsync(49)
        expect(settled).not.toHaveBeenCalled()
        expect(proxyConnection?.destroyed).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        await timedOut
        await proxyClosed
        expect(proxyConnection?.destroyed).toBe(true)
    })

    it('rejects with a typed timeout when a SOCKS5 proxy stalls mid-negotiation', async () => {
        const proxyClosed = waitForProxyClose()
        const credentialsReceived = new Promise<void>(resolve => {
            server.once('connection', socket => {
                proxyConnection = socket
                // Choose password authentication, read the credentials, then stall.
                socket.once('data', () => {
                    socket.once('data', () => resolve())
                    socket.write(Buffer.from([0x05, 0x02]))
                })
            })
        })

        jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] })
        const timedOut = expect(
            connect({
                host: 'smtp.lef.test',
                port: 2525,
                timeout: 50,
                proxy: { type: 'socks5', host: '127.0.0.1', port, user: 'user', password: 'pass' },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        const settled = jest.fn()
        void timedOut.then(settled, settled)

        await credentialsReceived
        await jest.advanceTimersByTimeAsync(49)
        expect(settled).not.toHaveBeenCalled()
        expect(proxyConnection?.destroyed).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        await timedOut
        await proxyClosed
        expect(proxyConnection?.destroyed).toBe(true)
    })

    it('rejects with a typed timeout when a SOCKS4 proxy accepts TCP but never responds', async () => {
        const proxyClosed = waitForProxyClose()
        const requestReceived = new Promise<void>(resolve => {
            server.once('connection', socket => {
                proxyConnection = socket
                socket.once('data', () => resolve())
            })
        })

        jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] })
        const timedOut = expect(
            connect({
                host: '127.0.0.1',
                port: 2525,
                timeout: 50,
                proxy: { type: 'socks4', host: '127.0.0.1', port },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        const settled = jest.fn()
        void timedOut.then(settled, settled)

        await requestReceived
        await jest.advanceTimersByTimeAsync(49)
        expect(settled).not.toHaveBeenCalled()
        expect(proxyConnection?.destroyed).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        await timedOut
        await proxyClosed
        expect(proxyConnection?.destroyed).toBe(true)
    })

    it('keeps a caller abort distinguishable from deadline expiry', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
        })

        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('caller cancelled')), 20)

        await expect(
            connect({
                host: 'smtp.lef.test',
                port: 2525,
                timeout: 5000,
                signal: controller.signal,
                proxy: { type: 'http', host: '127.0.0.1', port },
            }),
        ).rejects.not.toBeInstanceOf(ConnectionTimeoutError)
    })
})
