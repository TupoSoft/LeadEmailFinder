import { createServer, Server, Socket } from 'node:net'
import { connect } from './connect'
import { ConnectionTimeoutError } from './connection-timeout.error'

describe('connect', () => {
    let server: Server
    let port: number
    let connection: Socket | undefined
    let proxyConnection: Socket | undefined

    beforeEach(async () => {
        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test server')
        }
        port = address.port
    })

    afterEach(async () => {
        connection?.destroy()
        proxyConnection?.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => (error != null ? reject(error) : resolve())))
    })

    it('connects directly to a responsive server, unaffected by a configured deadline', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
        })

        connection = await connect({ host: '127.0.0.1', port, timeout: 2000 })

        expect(connection.destroyed).toBe(false)
    })

    it('rejects with a typed timeout and destroys the socket when an HTTP CONNECT proxy never responds', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
            // Accept the TCP connection and read the CONNECT request, but never answer it.
        })

        const start = Date.now()
        await expect(
            connect({
                host: 'smtp.lef.test',
                port: 2525,
                timeout: 50,
                proxy: { type: 'http', host: '127.0.0.1', port },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        expect(Date.now() - start).toBeLessThan(500)
    })

    it('rejects with a typed timeout when a SOCKS5 proxy stalls mid-negotiation', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
            // Accept the TCP connection and reply to the auth-method negotiation, then stall forever.
            socket.once('data', () => {
                socket.write(Buffer.from([0x05, 0x02]))
            })
        })

        const start = Date.now()
        await expect(
            connect({
                host: 'smtp.lef.test',
                port: 2525,
                timeout: 50,
                proxy: { type: 'socks5', host: '127.0.0.1', port, user: 'user', password: 'pass' },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        expect(Date.now() - start).toBeLessThan(500)
    })

    it('rejects with a typed timeout when a SOCKS4 proxy accepts TCP but never responds', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
        })

        const start = Date.now()
        await expect(
            connect({
                host: '127.0.0.1',
                port: 2525,
                timeout: 50,
                proxy: { type: 'socks4', host: '127.0.0.1', port },
            }),
        ).rejects.toBeInstanceOf(ConnectionTimeoutError)
        expect(Date.now() - start).toBeLessThan(500)
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
