import { Socket } from 'node:net'
import { type ConnectionOptions as TlsConnectionOptions, type TLSSocket } from 'node:tls'
import {
    DEFAULT_EHLO_TIMEOUT,
    DEFAULT_GREETING_TIMEOUT,
    DEFAULT_MAIL_TIMEOUT,
    DEFAULT_RCPT_TIMEOUT,
    DEFAULT_SMTP_CLIENT_TIMEOUT,
    DEFAULT_STARTTLS_TIMEOUT,
    SMTP_PORT,
    SMTP_RESPONSE_REGEX,
} from './smtp.constants'
import { hostname as osHostname } from 'os'
import { connect, ConnectionTimeoutError, readUntil, tlsConnectAsync, write } from '@tuposoft/lead-email-finder/socket'
import { parseSmtpResponse, promiseWithTimeout } from './smtp.util'
import { Logger } from '@nestjs/common'
import { isNativeError } from 'node:util/types'
import { IProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { ISmtpClient } from './smtp-client.interface'
import { SmtpClientTimeoutException } from './smtp-client-timeout.exception'
import { SmtpException } from './smtp.exception'
import { SmtpResponse } from './smtp-response.interface'
import { SmtpErrorStatusCode, SmtpOkStatusCode } from './smtp.enums'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import { SmtpSecureTransportUnavailableException } from '../../infrastructure/smtp/smtp-secure-transport-unavailable.exception'

export interface SmtpClientTimeoutConfig {
    greeting: number
    ehlo: number
    startTls: number
    mail: number
    rcpt: number
}

export interface SmtpClientConstructorOptions {
    host: string
    port?: number
    proxy?: IProxy
    timeouts?: Partial<SmtpClientTimeoutConfig>
    signal?: AbortSignal
    ca?: TlsConnectionOptions['ca']
}

type SmtpStatusCode = SmtpErrorStatusCode | SmtpOkStatusCode
type SmtpCommandKind = 'ehlo' | 'starttls' | 'mail_from' | 'rcpt_to' | 'quit'

export class SmtpClient implements ISmtpClient {
    private static readonly DEFAULT_TIMEOUT_CONFIG: Required<SmtpClientTimeoutConfig> = {
        greeting: DEFAULT_GREETING_TIMEOUT,
        ehlo: DEFAULT_EHLO_TIMEOUT,
        startTls: DEFAULT_STARTTLS_TIMEOUT,
        mail: DEFAULT_MAIL_TIMEOUT,
        rcpt: DEFAULT_RCPT_TIMEOUT,
    }

    public readonly exchange: string
    public readonly port: number
    public readonly hostname: string
    public secureTransport = false

    private readonly timeouts: Required<SmtpClientTimeoutConfig>
    private socket: Socket | TLSSocket
    private readonly proxy?: IProxy
    private readonly signal?: AbortSignal
    private readonly ca?: TlsConnectionOptions['ca']
    private readonly logger = new Logger(SmtpClient.name)

    constructor({ host, port = SMTP_PORT, proxy, timeouts, signal, ca }: SmtpClientConstructorOptions) {
        this.exchange = host
        this.port = port
        this.proxy = proxy
        this.signal = signal
        this.hostname = proxy != null ? proxy.host : osHostname()
        this.ca = ca
        this.timeouts = { ...SmtpClient.DEFAULT_TIMEOUT_CONFIG, ...timeouts }
        this.socket = new Socket({
            signal,
        })

        // Destroying a socket with an error (see destroySocket()) makes it emit that error asynchronously;
        // without a listener, Node treats an unconsumed socket 'error' event as an uncaught exception.
        this.attachSocketErrorLogger(this.socket)
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

    async startSession(hostname: string): Promise<void> {
        try {
            const firstEhlo = await this.sendCommandWithTimeout('EHLO ' + hostname, 'ehlo', this.timeouts.ehlo)
            if (firstEhlo.code !== SmtpOkStatusCode.OK || !firstEhlo.capabilities.includes('STARTTLS')) {
                throw new SmtpSecureTransportUnavailableException()
            }

            await promiseWithTimeout(
                async signal => {
                    const startTlsResponse = await this.sendCommand('STARTTLS', 'starttls', signal)
                    if (startTlsResponse.code !== SmtpOkStatusCode.ServiceReady) {
                        throw new SmtpSecureTransportUnavailableException()
                    }

                    const tlsOptions: TlsConnectionOptions = {
                        socket: this.socket,
                        servername: this.exchange,
                        rejectUnauthorized: true,
                    }
                    if (this.ca !== undefined) {
                        tlsOptions.ca = this.ca
                    }

                    this.socket = await tlsConnectAsync(tlsOptions, signal)
                    this.secureTransport = true
                    this.attachSocketErrorLogger(this.socket)
                },
                this.timeouts.startTls,
                new SmtpClientTimeoutException(),
            )

            const secondEhlo = await this.sendCommandWithTimeout('EHLO ' + hostname, 'ehlo', this.timeouts.ehlo)
            if (secondEhlo.code !== SmtpOkStatusCode.OK) {
                throw new SmtpSecureTransportUnavailableException()
            }
        } catch (error) {
            this.destroySocket(error)
            throw error instanceof SmtpSecureTransportUnavailableException
                ? error
                : new SmtpSecureTransportUnavailableException(error)
        }
    }

    async mailFrom(email: string): Promise<void> {
        await this.sendCommandWithTimeout('MAIL FROM: <' + email + '>', 'mail_from', this.timeouts.mail)
    }

    async rcptTo(email: string): Promise<void> {
        await this.sendCommandWithTimeout('RCPT TO: <' + email + '>', 'rcpt_to', this.timeouts.rcpt)
    }

    async quit(): Promise<void> {
        if (this.socket.readyState !== 'closed') {
            await this.sendCommand('QUIT', 'quit')
        }
    }

    end(): void {
        this.socket.end()
    }

    private destroySocket(error: unknown): void {
        if (!this.socket.destroyed) {
            this.socket.destroy(isNativeError(error) ? error : undefined)
        }
    }

    private async readResponse(signal?: AbortSignal): Promise<SmtpResponse> {
        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX, undefined, signal)
        const smtpResponse = parseSmtpResponse(response)
        const { code, enhancedCode, message } = smtpResponse
        const responseFields = {
            smtpResponseCode: code,
            smtpResponseEnhancedCode: enhancedCode,
        }

        if (SmtpClient.isNegativeStatusCode(code)) {
            this.logger.error('smtp_response_rejected', responseFields)

            throw new SmtpException({
                code,
                enhancedCode,
                message,
                targetExchange: this.exchange,
                proxyId: this.proxy?.id,
            })
        }

        this.logger.log('smtp_response_received', responseFields)
        return smtpResponse
    }

    private async sendCommand(
        command: string,
        commandKind: SmtpCommandKind,
        signal?: AbortSignal,
    ): Promise<SmtpResponse> {
        this.logger.log('smtp_command_sent', { commandKind })

        await write(this.socket, command + '\r\n', signal)
        return this.readResponse(signal)
    }

    private async sendCommandWithTimeout(
        command: string,
        commandKind: SmtpCommandKind,
        timeout: number,
    ): Promise<SmtpResponse> {
        try {
            return await promiseWithTimeout(
                signal => this.sendCommand(command, commandKind, signal),
                timeout,
                new SmtpClientTimeoutException(),
            )
        } catch (error) {
            this.destroySocket(error)
            throw error
        }
    }

    private attachSocketErrorLogger(socket: Socket | TLSSocket): void {
        socket.on('error', error => {
            this.logger.debug('smtp_socket_error', {
                errorClass: safeErrorType(error),
            })
        })
    }
}
