import { createServer, Server, Socket } from 'node:net'
import { tlsConnectAsync } from './tls-connect'

describe('tlsConnectAsync', () => {
    let server: Server
    let port: number
    let connection: Socket | undefined
    let proxyConnection: Socket | undefined

    beforeEach(async () => {
        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test TLS server')
        }
        port = address.port
    })

    afterEach(async () => {
        connection?.destroy()
        proxyConnection?.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => (error != null ? reject(error) : resolve())))
    })

    it('rejects and destroys the socket when the peer never completes the TLS handshake', async () => {
        server.once('connection', socket => {
            proxyConnection = socket
            // Accept the TCP connection but never speak TLS -- the handshake stalls forever.
        })

        connection = new Socket()
        connection.connect(port, '127.0.0.1')

        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('deadline')), 30)

        const start = Date.now()
        await expect(tlsConnectAsync({ socket: connection }, controller.signal)).rejects.toThrow()
        expect(Date.now() - start).toBeLessThan(500)
    })
})
