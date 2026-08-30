import { Socket } from 'node:net'
import {
    DEFAULT_GREETING_TIMEOUT,
    DEFAULT_MAIL_TIMEOUT,
    DEFAULT_RCPT_TIMEOUT,
    DEFAULT_SMTP_CLIENT_TIMEOUT,
    SMTP_PORT,
    SMTP_RESPONSE_REGEX,
} from './smtp.constants'
import { hostname as osHostname } from 'os'
import { connect, ConnectionTimeoutError, readUntil, write } from '@tuposoft/lead-email-finder/socket'
import { parseSmtpResponse, promiseWithTimeout } from './smtp.util'
import { Logger } from '@nestjs/common'
import { isNativeError } from 'node:util/types'
import { IProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { ISmtpClient } from './smtp-client.interface'
import { SmtpClientTimeoutException } from './smtp-client-timeout.exception'
import { SmtpException } from './smtp.exception'
import { SmtpResponse } from './smtp-response.interface'
import { SmtpErrorStatusCode, SmtpOkStatusCode } from './smtp.enums'

export interface SmtpClientTimeoutConfig {
    greeting: number
    mail: number
    rcpt: number
}

export interface SmtpClientConstructorOptions {
    host: string
    port?: number
    proxy?: IProxy
    timeouts?: SmtpClientTimeoutConfig
    signal?: AbortSignal
}

type SmtpStatusCode = SmtpErrorStatusCode | SmtpOkStatusCode

export class SmtpClient implements ISmtpClient {
    private static readonly DEFAULT_TIMEOUT_CONFIG: Required<SmtpClientTimeoutConfig> = {
        greeting: DEFAULT_GREETING_TIMEOUT,
        mail: DEFAULT_MAIL_TIMEOUT,
        rcpt: DEFAULT_RCPT_TIMEOUT,
    }

    public readonly exchange: string
    public readonly port: number
    public readonly hostname: string

    private readonly timeouts: Required<SmtpClientTimeoutConfig>
    private readonly socket: Socket
    private readonly proxy?: IProxy
    private readonly signal?: AbortSignal
    private readonly logger = new Logger(SmtpClient.name)

    constructor({ host, port = SMTP_PORT, proxy, timeouts, signal }: SmtpClientConstructorOptions) {
        this.exchange = host
        this.port = port
        this.proxy = proxy
        this.signal = signal
        this.hostname = proxy != null ? proxy.host : osHostname()
        this.timeouts = timeouts ?? SmtpClient.DEFAULT_TIMEOUT_CONFIG
        this.socket = new Socket({
            signal,
        })

        // Destroying a socket with an error (see destroySocket()) makes it emit that error asynchronously;
        // without a listener, Node treats an unconsumed socket 'error' event as an uncaught exception.
        this.socket.on('error', error => {
            this.logger.debug(`Socket error: ${error.message}`)
        })
    }

    private static isNegativeStatusCode(code: SmtpStatusCode): code is SmtpErrorStatusCode {
        return code >= SmtpErrorStatusCode.MailboxUnavailable
    }

    connect: () => Promise<void> = async () => {
        const { exchange, port, proxy, signal } = this

        try {
            await connect({
                host: exchange,
                port,
                proxy,
                signal,
                timeout: DEFAULT_SMTP_CLIENT_TIMEOUT,
                socket: this.socket,
            })
        } catch (error) {
            this.destroySocket(error)
            throw error instanceof ConnectionTimeoutError ? new SmtpClientTimeoutException() : error
        }

        try {
            const { code, enhancedCode, message } = await promiseWithTimeout(
                greetingSignal => this.readResponse(greetingSignal),
                this.timeouts.greeting,
                new SmtpClientTimeoutException(),
            )

            if (SmtpClient.isNegativeStatusCode(code)) {
                throw new SmtpException({
                    code,
                    enhancedCode,
                    message,
                    targetExchange: this.exchange,
                    proxyId: proxy?.id,
                })
            }
        } catch (error) {
            this.destroySocket(error)
            throw error
        }
    }

    private destroySocket(error: unknown): void {
        if (!this.socket.destroyed) {
            this.socket.destroy(isNativeError(error) ? error : undefined)
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

    private async readResponse(signal?: AbortSignal): Promise<SmtpResponse> {
        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX, undefined, signal)
        this.logger.log(`Response: ${response}`)

        const smtpResponse = parseSmtpResponse(response)
        const { code, enhancedCode, message } = smtpResponse

        if (SmtpClient.isNegativeStatusCode(code)) {
            this.logger.error(`Error in SMTP response: ${message}`, {
                smtpResponseCode: code,
                smtpResponseEnhancedCode: enhancedCode,
            })

            throw new SmtpException({
                code,
                enhancedCode,
                message,
                targetExchange: this.exchange,
                proxyId: this.proxy?.id,
            })
        }

        return smtpResponse
    }

    private async sendCommand(command: string, signal?: AbortSignal): Promise<void> {
        this.logger.log(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`, signal)
        await this.readResponse(signal)
    }

    private async sendCommandWithTimeout(command: string, timeout: number): Promise<void> {
        try {
            await promiseWithTimeout(
                signal => this.sendCommand(command, signal),
                timeout,
                new SmtpClientTimeoutException(),
            )
        } catch (error) {
            this.destroySocket(error)
            throw error
        }
    }
}
