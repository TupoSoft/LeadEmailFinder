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
import { promiseWithTimeout } from '../../../util/timeout'
import { connect, readUntil, write } from '../../../socket'
import { parseSmtpResponse } from './smtp.util'
import { Logger } from '@nestjs/common'
import { IProxy } from '../../../common'
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
    }

    private static isNegativeStatusCode(code: SmtpStatusCode): code is SmtpErrorStatusCode {
        return code >= SmtpErrorStatusCode.MailboxUnavailable
    }

    connect: () => Promise<void> = async () => {
        const { exchange, port, proxy, signal } = this

        this.socket.once('timeout', () => {
            this.logger.error(`Socket timed out`)
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
            new SmtpClientTimeoutException(),
        )

        if (SmtpClient.isNegativeStatusCode(code)) {
            throw new SmtpException({ code, enhancedCode, message, targetExchange: this.exchange, proxyId: proxy?.id })
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

    private async sendCommand(command: string): Promise<void> {
        this.logger.log(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`)
        await this.readResponse()
    }

    private async sendCommandWithTimeout(command: string, timeout: number): Promise<void> {
        await promiseWithTimeout(this.sendCommand(command), timeout, new SmtpClientTimeoutException())
    }
}
