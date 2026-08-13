import { createServer, Server, Socket } from 'node:net'
import { connectViaSocks5Proxy } from './socks5-connect'
import { readBytes } from './stream'

describe('connectViaSocks5Proxy', () => {
    let server: Server
    let proxyPort: number
    let connection: Socket | undefined
    let proxyConnection: Socket | undefined

    beforeEach(async () => {
        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test SOCKS5 server')
        }
        proxyPort = address.port
    })

    afterEach(async () => {
        connection?.destroy()
        proxyConnection?.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => (error != null ? reject(error) : resolve())))
    })

    it('authenticates and sends a domain target without leaking the proxy response into the application stream', async () => {
        const requests: Buffer[] = []
        const applicationSocket = new Socket()

        server.once('connection', socket => {
            proxyConnection = socket
            let step = 0
            socket.on('data', data => {
                requests.push(data)

                if (step === 0) {
                    socket.write(Buffer.from([0x05, 0x02]))
                } else if (step === 1) {
                    socket.write(Buffer.from([0x01, 0x00]))
                } else {
                    socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 25]))
                    socket.write('220 smtp.lef.test ESMTP\r\n')
                }

                step += 1
            })
        })

        connection = await connectViaSocks5Proxy({
            host: 'smtp.lef.test',
            port: 2525,
            socket: applicationSocket,
            proxy: {
                type: 'socks5',
                host: '127.0.0.1',
                port: proxyPort,
                user: 'smtp-dev',
                password: 'smtp-dev',
            },
        })

        expect(connection).toBe(applicationSocket)

        expect(requests[0]).toEqual(Buffer.from([0x05, 0x01, 0x02]))
        expect(requests[1]).toEqual(Buffer.from([0x01, 0x08, ...Buffer.from('smtp-dev'), 0x08, ...Buffer.from('smtp-dev')]))
        expect(requests[2]).toEqual(
            Buffer.from([0x05, 0x01, 0x00, 0x03, 0x0d, ...Buffer.from('smtp.lef.test'), 0x09, 0xdd]),
        )

        const greeting = await readBytes(connection, Buffer.byteLength('220 smtp.lef.test ESMTP\r\n'))
        expect(greeting.toString()).toBe('220 smtp.lef.test ESMTP\r\n')
    })
})
