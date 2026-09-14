import { createServer as createNetServer, type Server as NetServer, Socket } from 'node:net'
import { createServer as createTlsServer, type Server as TlsServer, type TLSSocket } from 'node:tls'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tlsConnectAsync } from './tls-connect'

const fixtureKey = readFileSync(resolve(process.cwd(), 'docker/smtp-dev/tls/smtp.key'))
const fixtureCertificate = readFileSync(resolve(process.cwd(), 'docker/smtp-dev/tls/smtp.crt'))
const fixtureCa = readFileSync(resolve(process.cwd(), 'docker/smtp-dev/tls/ca.crt'))

describe('tlsConnectAsync', () => {
    let server: NetServer | TlsServer
    let connection: Socket | undefined
    let tlsConnection: TLSSocket | undefined
    let peerConnection: Socket | undefined
    let port: number

    afterEach(async () => {
        tlsConnection?.destroy()
        connection?.destroy()
        peerConnection?.destroy()
        if (server?.listening) {
            await new Promise<void>((resolveClose, reject) =>
                server.close(error => (error != null ? reject(error) : resolveClose())),
            )
        }
    })

    async function listen(): Promise<void> {
        await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test TLS server')
        }
        port = address.port
    }

    async function connectRawSocket(): Promise<Socket> {
        const socket = new Socket()
        await new Promise<void>((resolveConnect, reject) => {
            socket.once('error', reject)
            socket.connect(port, '127.0.0.1', () => {
                socket.off('error', reject)
                resolveConnect()
            })
        })
        return socket
    }

    it('upgrades an existing socket with the fixture root and matching SNI', async () => {
        server = createTlsServer({ key: fixtureKey, cert: fixtureCertificate }, socket => socket.end())
        await listen()
        connection = await connectRawSocket()

        tlsConnection = await tlsConnectAsync({
            socket: connection,
            servername: 'smtp.lef.test',
            rejectUnauthorized: true,
            ca: fixtureCa,
        })

        expect(tlsConnection.authorized).toBe(true)
    })

    it('rejects a certificate whose hostname does not match SNI and closes the socket', async () => {
        server = createTlsServer({ key: fixtureKey, cert: fixtureCertificate })
        await listen()
        connection = await connectRawSocket()

        await expect(
            tlsConnectAsync({
                socket: connection,
                servername: 'wrong.lef.test',
                rejectUnauthorized: true,
                ca: fixtureCa,
            }),
        ).rejects.toThrow()
        expect(connection.destroyed).toBe(true)
    })

    it('rejects an untrusted certificate and closes the socket', async () => {
        server = createTlsServer({ key: fixtureKey, cert: fixtureCertificate })
        await listen()
        connection = await connectRawSocket()

        await expect(
            tlsConnectAsync({
                socket: connection,
                servername: 'smtp.lef.test',
                rejectUnauthorized: true,
            }),
        ).rejects.toThrow()
        expect(connection.destroyed).toBe(true)
    })

    it('rejects and destroys the socket when the peer never completes the TLS handshake', async () => {
        const handshakeStarted = new Promise<Buffer>(resolveHandshake => {
            server = createNetServer(socket => {
                peerConnection = socket
                socket.once('data', resolveHandshake)
            })
        })
        await listen()
        connection = await connectRawSocket()

        const controller = new AbortController()
        const reason = new Error('deadline')
        const rejected = expect(tlsConnectAsync({ socket: connection }, controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
            cause: reason,
        })

        const clientHello = await handshakeStarted
        expect(clientHello[0]).toBe(0x16)
        controller.abort(reason)
        await rejected
        expect(connection.destroyed).toBe(true)
    })
})
