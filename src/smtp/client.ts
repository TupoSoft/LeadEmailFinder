import { Socket } from 'node:net'
import type { Proxy } from '../proxy'
import { DEFAULT_SMTP_CLIENT_TIMEOUT, DEFAULT_TIMEOUT_CONFIG, SMTP_PORT, SMTP_RESPONSE_REGEX } from './constants'
import { hostname as osHostname } from 'os'
import { promiseWithTimeout } from '../util/timeout'
import { SmtpClientTimeoutError, SmtpError } from './errors'
import type { SmtpResponse } from './dto'
import { connect, readUntil, write } from '../socket'
import { parseSmtpResponse } from './util'
import type { ExtensibleLogger } from '../logging'
import type { ConnectionLimiter } from './connection-limiter'
import { SmtpNegativeStatusCode, type SmtpStatusCode } from './enums'

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
    logger?: ExtensibleLogger
}

export class SmtpClientImpl implements SmtpClient {
    public readonly exchange: string
    public readonly port: number

    public readonly hostname: string

    private readonly timeouts: Required<SmtpClientTimeoutConfig>
    private readonly socket: Socket

    private readonly proxy?: Proxy
    private readonly signal?: AbortSignal
    private readonly logger?: ExtensibleLogger

    constructor(
        { host, port = SMTP_PORT, proxy, timeouts = {}, signal, logger }: SmtpClientConstructorOptions,
        private readonly connectionLimiter: ConnectionLimiter,
    ) {
        this.exchange = host
        this.port = port
        this.proxy = proxy
        this.signal = signal
        this.hostname = proxy != null ? proxy.host : osHostname()
        this.timeouts = Object.assign(timeouts, DEFAULT_TIMEOUT_CONFIG)
        this.logger = logger
        this.socket = new Socket({
            signal,
        })
    }

    private static isNegativeStatusCode(code: SmtpStatusCode): code is SmtpNegativeStatusCode {
        return code >= SmtpNegativeStatusCode.MailboxUnavailable
    }

    connect: () => Promise<void> = async () => {
        const { exchange, port, proxy, signal } = this

        const token = await this.connectionLimiter.acquire(this.hostname, this.exchange, signal)

        const onClose = (): void => {
            if (token !== null) {
                void this.connectionLimiter.release(this.hostname, this.exchange, token)
            }
        }

        this.socket.once('close', onClose)
        this.socket.once('timeout', () => {
            this.logger?.info(`Socket timed out`)
            this.socket.end()
        })

        await connect({
            host: exchange,
            port,
            proxy,
            signal,
            timeout: DEFAULT_SMTP_CLIENT_TIMEOUT,
            socket: this.socket,
        })

        const { code, enhancedCode, message } = await promiseWithTimeout(
            this.readResponse(),
            this.timeouts.greeting,
            new SmtpClientTimeoutError(),
        )

        if (SmtpClientImpl.isNegativeStatusCode(code)) {
            throw new SmtpError({ code, enhancedCode, message, targetExchange: this.exchange, proxyId: proxy?.id })
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
        this.logger?.info(`Response: ${response}`)

        const smtpResponse = parseSmtpResponse(response)
        const { code, enhancedCode, message } = smtpResponse

        if (SmtpClientImpl.isNegativeStatusCode(code)) {
            this.logger?.error(`Error in SMTP response: ${message}`, {
                smtpResponseCode: code,
                smtpResponseEnhancedCode: enhancedCode,
            })

            throw new SmtpError({ code, enhancedCode, message, targetExchange: this.exchange, proxyId: this.proxy?.id })
        }

        return smtpResponse
    }

    private async sendCommand(command: string): Promise<void> {
        this.logger?.info(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`)
        await this.readResponse()
    }

    private async sendCommandWithTimeout(command: string, timeout: number): Promise<void> {
        await promiseWithTimeout(this.sendCommand(command), timeout, new SmtpClientTimeoutError())
    }
}
