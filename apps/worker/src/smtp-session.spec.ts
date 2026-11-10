import { createServer, Server, Socket } from 'node:net'
import { createSecureContext, TLSSocket } from 'node:tls'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SmtpSession } from './smtp-session'

const fixtures = resolve(__dirname, '../../api/test/fixtures/smtp-tls')
const ca = readFileSync(resolve(fixtures, 'ca.crt'), 'utf8')
const context = createSecureContext({
    cert: readFileSync(resolve(fixtures, 'smtp.crt'), 'utf8'),
    key: readFileSync(resolve(fixtures, 'smtp.key'), 'utf8'),
})

describe('SmtpSession', () => {
    let server: Server
    let port: number
    let connection: Socket | undefined
    let transcript: string[]

    beforeEach(async () => {
        transcript = []
        server = createServer()
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('fixture_bind_failed')
        }

        port = address.port
    })

    afterEach(async () => {
        connection?.destroy()

        if (server.listening) {
            await new Promise<void>(resolve => server.close(() => resolve()))
        }
    })

    function session(
        signal = new AbortController().signal,
        customCa: string[] | undefined = [ca],
        timeout = 1000,
    ): SmtpSession {
        return new SmtpSession(
            signal,
            {
                ehloHostname: 'client.example.com',
                mailFrom: 'sender@example.com',
                ca: customCa,
            },
            port,
            timeout,
        )
    }

    function serve(
        options: {
            advertiseStartTls?: boolean
            rejectStartTls?: boolean
            stallTls?: boolean
            stallRcpt?: boolean
            rejectSender?: boolean
            rejectRecipient?: boolean
        } = {},
    ): void {
        server.once('connection', socket => {
            connection = socket
            socket.on('error', () => {})
            socket.write('220 smtp.lef.test ESMTP\r\n')

            const handle = (stream: Socket): void => {
                stream.on('data', function receive(data) {
                    const commands = data.toString().split('\r\n').filter(Boolean)

                    for (const command of commands) {
                        transcript.push(command)

                        if (command.startsWith('EHLO')) {
                            const capabilities =
                                options.advertiseStartTls === false
                                    ? '250-smtp.lef.test\r\n250 SIZE 1024\r\n'
                                    : '250-smtp.lef.test\r\n250-STARTTLS\r\n250 SIZE 1024\r\n'

                            stream.write(capabilities)
                        } else if (command === 'STARTTLS') {
                            const reply = options.rejectStartTls ? '454 TLS unavailable\r\n' : '220 Ready for TLS\r\n'
                            stream.write(reply)

                            if (options.rejectStartTls || options.stallTls) {
                                continue
                            }

                            stream.removeListener('data', receive)
                            const secure = new TLSSocket(stream, { isServer: true, secureContext: context })
                            connection = secure
                            secure.on('error', () => {})
                            handle(secure)
                        } else if (command.startsWith('MAIL FROM')) {
                            const reply = options.rejectSender ? '550 5.1.1 Sender does not exist\r\n' : '250 OK\r\n'
                            stream.write(reply)
                        } else if (command.startsWith('RCPT TO')) {
                            if (!options.stallRcpt) {
                                const reply = options.rejectRecipient
                                    ? '550 5.1.1 Recipient does not exist\r\n'
                                    : '250 OK\r\n'

                                stream.write(reply)
                            }
                        } else if (command === 'QUIT') {
                            stream.write('221 Bye\r\n')
                        }
                    }
                })
            }

            handle(socket)
        })
    }

    it('propagates a connect-phase failure and closes the socket', async () => {
        await new Promise<void>(resolve => server.close(() => resolve()))
        const client = session()
        await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow()
        await client.close()
    })

    it('closes the connection when the greeting never arrives', async () => {
        server.once('connection', socket => {
            connection = socket
        })
        const client = session(undefined, [ca], 30)
        await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow()
        await client.close()
    })

    it('requires EHLO, STARTTLS, certificate verification, and a second EHLO before mailbox commands', async () => {
        serve()
        const client = session()
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).resolves.toMatchObject({
                code: 250,
                stage: 'rcpt_to',
                verifiedTransport: true,
                senderAccepted: true,
            })
            expect(transcript).toEqual([
                'EHLO client.example.com',
                'STARTTLS',
                'EHLO client.example.com',
                'MAIL FROM:<sender@example.com>',
                'RCPT TO:<recipient@example.com>',
                'QUIT',
            ])
        } finally {
            await client.close()
        }
    })

    it('fails certificate verification without the configured SMTP-only trust root', async () => {
        serve()
        const client = session(undefined, [])
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow()
            expect(transcript).not.toContain('MAIL FROM:<sender@example.com>')
        } finally {
            await client.close()
        }
    })

    it('fails closed when EHLO does not advertise a standalone STARTTLS capability', async () => {
        serve({ advertiseStartTls: false })
        const client = session()
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow(
                'secure_transport_unavailable',
            )
            expect(transcript).toEqual(['EHLO client.example.com'])
        } finally {
            await client.close()
        }
    })

    it('fails closed when the server rejects STARTTLS', async () => {
        serve({ rejectStartTls: true })
        const client = session()
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow(
                'secure_transport_unavailable',
            )
            expect(transcript).toEqual(['EHLO client.example.com', 'STARTTLS'])
        } finally {
            await client.close()
        }
    })

    it('aborts a stalled TLS handshake and closes the socket', async () => {
        serve({ stallTls: true })
        const controller = new AbortController()
        const client = session(controller.signal)
        const timer = setTimeout(() => controller.abort(), 50)
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow()
        } finally {
            clearTimeout(timer)
            await client.close()
        }
    })

    it('tags a MAIL FROM rejection with its own command stage, distinct from RCPT TO', async () => {
        serve({ rejectSender: true })
        const client = session()
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).resolves.toMatchObject({
                code: 550,
                enhancedCode: '5.1.1',
                stage: 'mail_from',
                senderAccepted: false,
            })
            expect(transcript.some(command => command.startsWith('RCPT TO'))).toBe(false)
        } finally {
            await client.close()
        }
    })

    it('closes the encrypted session when RCPT TO stalls', async () => {
        serve({ stallRcpt: true })
        const controller = new AbortController()
        const client = session(controller.signal)
        const timer = setTimeout(() => controller.abort(), 50)
        try {
            await expect(client.probe('127.0.0.1', 'smtp.lef.test', 'recipient@example.com')).rejects.toThrow()
        } finally {
            clearTimeout(timer)
            await client.close()
        }
    })

    it('classifies a rejected recipient without logging commands, addresses, or the raw reply', async () => {
        serve({ rejectRecipient: true })
        const stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
        const client = session()
        try {
            await expect(
                client.probe('127.0.0.1', 'smtp.lef.test', 'unique-recipient@private.example'),
            ).resolves.toMatchObject({ code: 550, enhancedCode: '5.1.1', stage: 'rcpt_to', senderAccepted: true })
            expect(stdout).not.toHaveBeenCalled()
        } finally {
            await client.close()
            stdout.mockRestore()
        }
    })
})
