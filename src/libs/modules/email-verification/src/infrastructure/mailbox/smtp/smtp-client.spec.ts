import { createServer, Server, Socket } from 'node:net'
import { type ConnectionOptions, type TLSSocket } from 'node:tls'
import { connect, ConnectionTimeoutError, ConnectOptions, tlsConnectAsync } from '@tuposoft/lead-email-finder/socket'
import { SmtpClient } from './smtp-client'
import { SmtpClientTimeoutException } from './smtp-client-timeout.exception'
import { Logger } from '@nestjs/common'
import { SmtpSecureTransportUnavailableException } from '../../smtp/smtp-secure-transport-unavailable.exception'

type SocketModule = typeof import('@tuposoft/lead-email-finder/socket')

const actualConnect: (options: ConnectOptions) => ReturnType<typeof connect> = jest.requireActual<SocketModule>(
    '@tuposoft/lead-email-finder/socket',
).connect

jest.mock('@tuposoft/lead-email-finder/socket', () => ({
    ...jest.requireActual<SocketModule>('@tuposoft/lead-email-finder/socket'),
    connect: jest.fn(),
    tlsConnectAsync: jest.fn(),
}))

const connectMock = jest.mocked(connect)
const tlsConnectAsyncMock = jest.mocked(tlsConnectAsync)

describe('SmtpClient', () => {
    let server: Server
    let port: number
    let serverConnection: Socket | undefined
    let transcript: string[]

    beforeEach(async () => {
        connectMock.mockImplementation(actualConnect)
        tlsConnectAsyncMock.mockImplementation(options =>
            Promise.resolve((options as ConnectionOptions).socket as TLSSocket),
        )
        transcript = []

        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to bind the test SMTP server')
        }
        port = address.port
    })

    afterEach(async () => {
        serverConnection?.destroy()
        if (server.listening) {
            await new Promise<void>((resolve, reject) =>
                server.close(error => (error != null ? reject(error) : resolve())),
            )
        }
        connectMock.mockReset()
        tlsConnectAsyncMock.mockReset()
    })

    function serveSmtp(
        options: {
            advertiseStartTls?: boolean
            rejectStartTls?: boolean
            stallRcpt?: boolean
            rejectRecipient?: string
        } = {},
    ): void {
        server.once('connection', socket => {
            serverConnection = socket
            socket.write('220 test.local ESMTP\r\n')
            socket.on('data', data => {
                for (const command of data.toString().split('\r\n').filter(Boolean)) {
                    transcript.push(command)
                    if (command.startsWith('EHLO')) {
                        socket.write(
                            options.advertiseStartTls === false
                                ? '250-test.local\r\n250 SIZE 1024\r\n'
                                : '250-test.local\r\n250-STARTTLS\r\n250 SIZE 1024\r\n',
                        )
                    } else if (command === 'STARTTLS') {
                        socket.write(
                            options.rejectStartTls === true ? '454 TLS unavailable\r\n' : '220 Ready for TLS\r\n',
                        )
                    } else if (command.startsWith('MAIL FROM')) {
                        socket.write('250 OK\r\n')
                    } else if (command.startsWith('RCPT TO')) {
                        if (options.stallRcpt === true) continue
                        socket.write(
                            options.rejectRecipient === undefined
                                ? '250 OK\r\n'
                                : '550 5.1.1 ' + options.rejectRecipient + ' does not exist\r\n',
                        )
                    } else if (command === 'QUIT') {
                        socket.write('221 Bye\r\n')
                    }
                }
            })
        })
    }

    it('maps a connect-phase ConnectionTimeoutError to SmtpClientTimeoutException and destroys the socket', async () => {
        const timeoutError = new ConnectionTimeoutError({ host: '127.0.0.1', port, timeoutMs: 1000 })
        connectMock.mockRejectedValueOnce(timeoutError)

        const client = new SmtpClient({ host: '127.0.0.1', port })
        const destroySpy = jest.spyOn(Socket.prototype, 'destroy')

        await expect(client.connect()).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        expect(destroySpy).toHaveBeenCalled()

        destroySpy.mockRestore()
    })

    it('merges partial timeout overrides and closes the connection when the greeting never arrives', async () => {
        server.once('connection', socket => {
            serverConnection = socket
        })

        const client = new SmtpClient({
            host: '127.0.0.1',
            port,
            timeouts: { greeting: 30 },
        })
        const closed = new Promise<void>(resolve => server.once('connection', socket => socket.once('close', resolve)))

        await expect(client.connect()).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        await closed
    })

    it('requires EHLO, STARTTLS, TLS verification, and a second EHLO before either mailbox command', async () => {
        serveSmtp()
        const client = new SmtpClient({ host: '127.0.0.1', port })

        await client.connect()
        await client.startSession('client.example.com')
        await client.mailFrom('sender@example.com')
        await client.rcptTo('recipient@example.com')
        await client.quit()
        client.end()

        expect(client.secureTransport).toBe(true)
        expect(transcript).toEqual([
            'EHLO client.example.com',
            'STARTTLS',
            'EHLO client.example.com',
            'MAIL FROM: <sender@example.com>',
            'RCPT TO: <recipient@example.com>',
            'QUIT',
        ])
        const tlsOptions = tlsConnectAsyncMock.mock.calls[0][0] as ConnectionOptions
        expect(tlsOptions).toEqual(
            expect.objectContaining({
                servername: '127.0.0.1',
                rejectUnauthorized: true,
                socket: expect.any(Socket),
            }),
        )
        expect(tlsOptions).not.toHaveProperty('ca')
    })

    it('threads configured SMTP-only trust into the TLS upgrade', async () => {
        serveSmtp()
        const ca = ['default-root', 'fixture-root']
        const client = new SmtpClient({ host: '127.0.0.1', port, ca })

        await client.connect()
        await client.startSession('client.example.com')
        client.end()

        expect(tlsConnectAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ ca }), expect.any(AbortSignal))
    })

    it('fails closed when EHLO does not advertise a standalone STARTTLS capability', async () => {
        serveSmtp({ advertiseStartTls: false })
        const client = new SmtpClient({ host: '127.0.0.1', port })

        await client.connect()
        await expect(client.startSession('client.example.com')).rejects.toBeInstanceOf(
            SmtpSecureTransportUnavailableException,
        )

        expect(client.secureTransport).toBe(false)
        expect(transcript).toEqual(['EHLO client.example.com'])
        expect(tlsConnectAsyncMock).not.toHaveBeenCalled()
    })

    it('fails closed when the server rejects STARTTLS', async () => {
        serveSmtp({ rejectStartTls: true })
        const client = new SmtpClient({ host: '127.0.0.1', port })

        await client.connect()
        await expect(client.startSession('client.example.com')).rejects.toBeInstanceOf(
            SmtpSecureTransportUnavailableException,
        )

        expect(client.secureTransport).toBe(false)
        expect(transcript).toEqual(['EHLO client.example.com', 'STARTTLS'])
        expect(tlsConnectAsyncMock).not.toHaveBeenCalled()
    })

    it('maps a stalled TLS handshake to secure_transport_unavailable and closes the socket', async () => {
        serveSmtp()
        const stalledHandshakeMock = tlsConnectAsyncMock as unknown as {
            mockImplementation(
                implementation: (options: ConnectionOptions, signal?: AbortSignal) => Promise<TLSSocket>,
            ): void
        }
        stalledHandshakeMock.mockImplementation(
            (_options, signal) =>
                new Promise<TLSSocket>((_resolve, reject) => {
                    signal?.addEventListener('abort', () => reject(new Error('TLS handshake aborted')), { once: true })
                }),
        )
        const client = new SmtpClient({
            host: '127.0.0.1',
            port,
            timeouts: { startTls: 30 },
        })
        await client.connect()
        const closed = new Promise<void>(resolve => serverConnection?.once('close', resolve))

        await expect(client.startSession('client.example.com')).rejects.toBeInstanceOf(
            SmtpSecureTransportUnavailableException,
        )
        await closed
        expect(client.secureTransport).toBe(false)
    })

    it('closes the encrypted session when RCPT TO stalls', async () => {
        serveSmtp({ stallRcpt: true })
        const client = new SmtpClient({
            host: '127.0.0.1',
            port,
            timeouts: { rcpt: 30 },
        })

        await client.connect()
        await client.startSession('client.example.com')
        await client.mailFrom('sender@example.com')
        const closed = new Promise<void>(resolve => serverConnection?.once('close', resolve))

        await expect(client.rcptTo('recipient@example.com')).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        await closed
    })

    it('classifies a rejected recipient without logging commands, addresses, or the raw reply', async () => {
        const sentinel = 'unique-recipient@private.example'
        const sender = 'unique-sender@private.example'
        const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
        const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
        const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation()

        try {
            serveSmtp({ rejectRecipient: sentinel })
            const client = new SmtpClient({ host: '127.0.0.1', port })
            await client.connect()
            await client.startSession('client.example.com')
            await client.mailFrom(sender)
            const closed = new Promise<void>(resolve => serverConnection?.once('close', resolve))

            await expect(client.rcptTo(sentinel)).rejects.toMatchObject({
                code: 550,
                enhancedCode: '5.1.1',
                message: sentinel + ' does not exist',
            })
            await closed

            expect(logSpy).toHaveBeenCalledWith('smtp_command_sent', { commandKind: 'starttls' })
            expect(logSpy).toHaveBeenCalledWith('smtp_command_sent', { commandKind: 'mail_from' })
            expect(logSpy).toHaveBeenCalledWith('smtp_command_sent', { commandKind: 'rcpt_to' })
            expect(errorSpy).toHaveBeenCalledWith('smtp_response_rejected', {
                smtpResponseCode: 550,
                smtpResponseEnhancedCode: '5.1.1',
            })

            const loggedArguments = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...debugSpy.mock.calls]
            const serializedLogs = JSON.stringify(loggedArguments)
            expect(serializedLogs).not.toContain(sentinel)
            expect(serializedLogs).not.toContain(sender)
            expect(serializedLogs).not.toContain('MAIL FROM')
            expect(serializedLogs).not.toContain('RCPT TO')
            expect(serializedLogs).not.toContain('does not exist')
        } finally {
            logSpy.mockRestore()
            errorSpy.mockRestore()
            debugSpy.mockRestore()
        }
    })
})
