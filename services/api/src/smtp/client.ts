import { Socket } from 'node:net'
import type { Proxy } from '../proxy'
import type { ConnectionLimiter } from './connection-limiter'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SMTP_CLIENT_TIMEOUT, DEFAULT_TIMEOUT_CONFIG, SMTP_PORT, SMTP_RESPONSE_REGEX } from './constants'
import { hostname as osHostname } from 'os'
import { promiseWithTimeout } from '../util/timeout'
import { SmtpClientTimeoutError, SmtpError } from './errors'
import { SmtpResponseCode } from './enums'
import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import type { SmtpResponse } from './dto'
import { readUntil, write } from '../stream'
import { parseSmtpResponse } from './util'
import { connect } from '../socket'
import type { ExtensibleLogger } from 'logging'

export interface SmtpClientTimeoutConfig {
    greeting?: number
    mail?: number
    rcpt?: number
}

export interface SmtpClient {
    exchange: string
    port: number
    hostname: string

    connect: () => Promise<void>
    helo: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>
    end: () => void
}

export interface SmtpClientConstructorOptions {
    host: string
    port?: number
    proxy?: Proxy
    timeouts?: SmtpClientTimeoutConfig
    signal?: AbortSignal
    socket?: Socket
    logger?: ExtensibleLogger
}

export class SmtpClientImpl implements SmtpClient {
    public readonly exchange: string
    public readonly port: number

    public readonly hostname: string

    private readonly id: string
    private readonly timeouts: Required<SmtpClientTimeoutConfig>
    private readonly socket: Socket

    private readonly proxy?: Proxy
    private readonly signal?: AbortSignal
    private readonly logger?: ExtensibleLogger

    constructor(
        { host, port, proxy, timeouts, signal, logger, socket }: SmtpClientConstructorOptions,
        private readonly connectionLimiter: ConnectionLimiter,
    ) {
        this.id = randomUUID()
        this.exchange = host
        this.port = port ?? SMTP_PORT
        this.proxy = proxy
        this.signal = signal
        this.hostname = proxy != null ? proxy.host : osHostname()
        this.timeouts = Object.assign(timeouts ?? {}, DEFAULT_TIMEOUT_CONFIG)
        this.logger = logger?.child({
            id: this.id,
            source: this.hostname,
            exchange: this.exchange,
        })
        this.socket =
            socket ??
            new Socket({
                signal,
            })
    }

    connect: () => Promise<void> = async () => {
        const { exchange, port, proxy, signal } = this

        const locked = await this.connectionLimiter.acquire(this.hostname, this.exchange, signal)

        const onClose = (): void => {
            if (locked) {
                void this.connectionLimiter.release(this.hostname, this.exchange)
            }
        }

        try {
            await connect({
                host: exchange,
                port,
                proxy,
                signal,
                timeout: DEFAULT_SMTP_CLIENT_TIMEOUT,
                socket: this.socket,
            })

            this.socket.once('close', onClose)
            this.socket.once('timeout', () => {
                this.logger?.debug(`Socket timed out`)
                this.socket.end()
            })

            const { code, enhancedCode, message } = await promiseWithTimeout(
                this.readResponse(),
                this.timeouts.greeting,
                new SmtpClientTimeoutError(this.id),
            )

            if (code !== SmtpResponseCode.ServiceReady) {
                throw new SmtpError(code, enhancedCode, message)
            }
        } catch (error) {
            onClose()
            ok(isNativeError(error))
            this.logger?.error(`Error in SMTPClient.connect: ${error.message}`)
            throw error
        }
    }

    async helo(hostname: string): Promise<void> {
        await this.sendCommand(`HELO ${hostname}`)
    }

    async mailFrom(email: string): Promise<void> {
        await this.sendCommandWithTimeout(`MAIL FROM: <${email}>`, this.timeouts.mail)
    }

    async rcptTo(email: string): Promise<void> {
        await this.sendCommandWithTimeout(`RCPT TO: <${email}>`, this.timeouts.rcpt)
    }

    async quit(): Promise<void> {
        if (this.socket.readyState !== 'closed') {
            await this.sendCommand('QUIT')
        }
    }

    end(): void {
        this.socket.end()
    }

    private async readResponse(): Promise<SmtpResponse> {
        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX)
        this.logger?.debug(`Response: ${response}`)

        const responseLines = response.split('\r\n')

        responseLines.pop()
        const lastLine = responseLines.pop()

        ok(lastLine !== undefined, `Malformed response: ${response}`)

        const smtpResponse = parseSmtpResponse(lastLine)
        const { code, enhancedCode, message } = smtpResponse

        if (code > SmtpResponseCode.OK) {
            this.logger?.error(`Error in SMTP response: ${message}`, {
                smtpResponseCode: code,
                smtpResponseEnhancedCode: enhancedCode,
                smtpResponseMessage: message,
            })

            throw new SmtpError(code, enhancedCode, message)
        }

        return smtpResponse
    }

    private async sendCommand(command: string): Promise<void> {
        this.logger?.debug(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`)
        await this.readResponse()
    }

    private async sendCommandWithTimeout(command: string, timeout: number): Promise<void> {
        await promiseWithTimeout(this.sendCommand(command), timeout, new SmtpClientTimeoutError(this.id))
    }
}
