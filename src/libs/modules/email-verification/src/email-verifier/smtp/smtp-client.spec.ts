import { createServer, Server, Socket } from 'node:net'
import { connect, ConnectionTimeoutError, ConnectOptions } from '@tuposoft/lead-email-finder/socket'
import { SmtpClient } from './smtp-client'
import { SmtpClientTimeoutException } from './smtp-client-timeout.exception'
import { Logger } from '@nestjs/common'

// The connect-phase deadline is hardcoded to DEFAULT_SMTP_CLIENT_TIMEOUT (1 minute, not test-injectable), so
// exercising it with a real socket would require waiting a real minute. Its underlying mechanism (a stalled
// direct/proxy peer actually timing out) is already proven with short, real deadlines in connect.spec.ts;
// here we only need to prove SmtpClient maps a ConnectionTimeoutError to SmtpClientTimeoutException and
// destroys its socket -- so `connect` is mocked, falling through to the real implementation except where a
// test overrides it.
type SocketModule = typeof import('@tuposoft/lead-email-finder/socket')

const actualConnect: (options: ConnectOptions) => ReturnType<typeof connect> =
    jest.requireActual<SocketModule>('@tuposoft/lead-email-finder/socket').connect

jest.mock('@tuposoft/lead-email-finder/socket', () => ({
    ...jest.requireActual<SocketModule>('@tuposoft/lead-email-finder/socket'),
    connect: jest.fn(),
}))

const connectMock = jest.mocked(connect)

describe('SmtpClient', () => {
    let server: Server
    let port: number
    let serverConnection: Socket | undefined

    beforeEach(async () => {
        connectMock.mockImplementation(actualConnect)

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
        await new Promise<void>((resolve, reject) => server.close(error => (error != null ? reject(error) : resolve())))
        connectMock.mockReset()
    })

    it('maps a connect-phase ConnectionTimeoutError to SmtpClientTimeoutException and destroys the socket', async () => {
        const timeoutError = new ConnectionTimeoutError({ host: '127.0.0.1', port, timeoutMs: 1000 })
        connectMock.mockRejectedValueOnce(timeoutError)

        const client = new SmtpClient({ host: '127.0.0.1', port })
        const destroySpy = jest.spyOn(Socket.prototype, 'destroy')

        await expect(client.connect()).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        expect(destroySpy).toHaveBeenCalled()

        destroySpy.mockRestore()
    })

    it('rejects with SmtpClientTimeoutException and closes the connection when the greeting never arrives', async () => {
        server.once('connection', socket => {
            serverConnection = socket
            // Accept the connection but never send the 220 greeting.
        })

        const client = new SmtpClient({
            host: '127.0.0.1',
            port,
            timeouts: { greeting: 30, mail: 5000, rcpt: 5000 },
        })

        const closed = new Promise<void>(resolve => server.once('connection', socket => socket.once('close', resolve)))

        await expect(client.connect()).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        await closed
    })

    it('rejects with SmtpClientTimeoutException and closes the connection when RCPT TO stalls', async () => {
        server.once('connection', socket => {
            serverConnection = socket
            socket.write('220 test.local ESMTP\r\n')
            socket.on('data', data => {
                const command = data.toString()
                if (command.startsWith('HELO')) {
                    socket.write('250 test.local\r\n')
                } else if (command.startsWith('MAIL FROM')) {
                    socket.write('250 OK\r\n')
                }
                // Never respond to RCPT TO.
            })
        })

        const client = new SmtpClient({
            host: '127.0.0.1',
            port,
            timeouts: { greeting: 5000, mail: 5000, rcpt: 30 },
        })

        await client.connect()
        await client.helo('client.example.com')
        await client.mailFrom('sender@example.com')

        const closed = new Promise<void>(resolve => serverConnection?.once('close', resolve))

        await expect(client.rcptTo('recipient@example.com')).rejects.toBeInstanceOf(SmtpClientTimeoutException)
        await closed
    })

    it('completes a full successful transcript unaffected by the deadline machinery', async () => {
        server.once('connection', socket => {
            serverConnection = socket
            socket.write('220 test.local ESMTP\r\n')
            socket.on('data', data => {
                const command = data.toString()
                if (command.startsWith('HELO')) {
                    socket.write('250 test.local\r\n')
                } else if (command.startsWith('MAIL FROM')) {
                    socket.write('250 OK\r\n')
                } else if (command.startsWith('RCPT TO')) {
                    socket.write('250 OK\r\n')
                } else if (command.startsWith('QUIT')) {
                    socket.write('221 Bye\r\n')
                }
            })
        })

        const client = new SmtpClient({ host: '127.0.0.1', port })

        await client.connect()
        await client.helo('client.example.com')
        await client.mailFrom('sender@example.com')
        await client.rcptTo('recipient@example.com')
        await client.quit()

        client.end()
    })

    it('classifies a rejected recipient without logging commands, addresses, or the raw reply', async () => {
        const sentinel = 'unique-recipient@private.example'
        const sender = 'unique-sender@private.example'
        const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
        const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
        const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation()

        try {
            server.once('connection', socket => {
                serverConnection = socket
                socket.write('220 test.local ESMTP\r\n')
                socket.on('data', data => {
                    const command = data.toString()
                    if (command.startsWith('HELO')) {
                        socket.write('250 test.local\r\n')
                    } else if (command.startsWith('MAIL FROM')) {
                        socket.write('250 OK\r\n')
                    } else if (command.startsWith('RCPT TO')) {
                        socket.write(`550 5.1.1 ${sentinel} does not exist\r\n`)
                    }
                })
            })

            const client = new SmtpClient({ host: '127.0.0.1', port })
            await client.connect()
            await client.helo('client.example.com')
            await client.mailFrom(sender)

            const closed = new Promise<void>(resolve => serverConnection?.once('close', resolve))

            await expect(client.rcptTo(sentinel)).rejects.toMatchObject({
                code: 550,
                enhancedCode: '5.1.1',
                message: `${sentinel} does not exist`,
            })
            await closed

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
