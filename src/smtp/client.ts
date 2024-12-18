import { SmtpError } from './errors'
import { DEFAULT_SMTP_CLIENT_TIMEOUT, SMTP_PORT, SMTP_RESPONSE_REGEX } from './constants'
import { SmtpResponseCode } from './enums'
import { ok } from 'node:assert'
import type { Socket } from 'node:net'
import { readUntil, write } from '../stream'
import { parseSmtpResponse } from './util'
import type { SmtpResponse } from './dto'
import type { Logger } from '../logging'
import type { Proxy } from '../proxy'
import type { ConnectionLimiter } from './connection-limiter'
import { hostname as osHostname } from 'node:os'
import { connect } from '../socket/connect'
import { isNativeError } from 'node:util/types'
import { randomUUID } from 'node:crypto'

export interface SmtpClientConnectOptions {
    exchange: string
    port?: number
    timeout?: number
    proxy?: Proxy
    signal?: AbortSignal
}

export interface SmtpClient {
    exchange: string
    hostname: string

    connect: (options: SmtpClientConnectOptions) => Promise<void>
    helo: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>
    end: () => void

    isReady: () => Promise<void>
}

export class SmtpClientImpl implements SmtpClient {
    private socket?: Socket

    constructor(
        private readonly connectionLimiter: ConnectionLimiter,
        private logger: Logger,
    ) {}

    private _exchange?: string

    get exchange(): string {
        ok(this._exchange !== undefined, new Error('The client is no connected'))

        return this._exchange
    }

    private set exchange(exchange: string) {
        this._exchange = exchange
    }

    private _hostname?: string

    get hostname(): string {
        ok(this._hostname !== undefined, new Error('The client is no connected'))

        return this._hostname
    }

    private set hostname(value: string) {
        this._hostname = value
    }

    connect: (options: SmtpClientConnectOptions) => Promise<void> = async options => {
        const { exchange, port = SMTP_PORT, proxy, signal, timeout = DEFAULT_SMTP_CLIENT_TIMEOUT } = options
        const hostname = proxy != null ? proxy.host : osHostname()

        const locked = await this.connectionLimiter.acquire(hostname, exchange, signal)

        const onClose = (): void => {
            if (locked) {
                void this.connectionLimiter.release(hostname, exchange)
            }
        }

        try {
            this.socket = await connect({
                host: exchange,
                port,
                proxy,
                signal,
                timeout,
            })

            this.logger = this.logger.child({
                id: randomUUID(),
                source: hostname,
                exchange,
            })

            this.socket.once('close', onClose)
            this.socket.once('timeout', () => {
                this.logger.debug(`Socket timed out`)
                this.socket?.end()
            })

            this.exchange = exchange
            this.hostname = hostname
        } catch (error) {
            onClose()

            ok(isNativeError(error))
            throw error
        }
    }

    isReady: () => Promise<void> = async () => {
        const { code, enhancedCode, message } = await this.readResponse()

        if (code !== SmtpResponseCode.ServiceReady) {
            throw new SmtpError(code, enhancedCode, message)
        }
    }

    async helo(hostname: string): Promise<void> {
        await this.sendCommand(`HELO ${hostname}`)
    }

    async mailFrom(senderEmail: string): Promise<void> {
        await this.sendCommand(`MAIL FROM: <${senderEmail}>`)
    }

    async rcptTo(receiverEmail: string): Promise<void> {
        await this.sendCommand(`RCPT TO: <${receiverEmail}>`)
    }

    async quit(): Promise<void> {
        ok(this.socket !== undefined, new Error('The client is no connected'))

        if (this.socket.readyState !== 'closed') {
            await this.sendCommand('QUIT')
        }
    }

    end(): void {
        this.socket?.end()
    }

    private async readResponse(): Promise<SmtpResponse> {
        ok(this.socket !== undefined, new Error('The client is no connected'))

        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX)
        this.logger.debug(`Response: ${response}`)

        const responseLines = response.split('\r\n')

        responseLines.pop()
        const lastLine = responseLines.pop()

        ok(lastLine !== undefined, `Malformed response: ${response}`)

        const smtpResponse = parseSmtpResponse(lastLine)
        const { code, enhancedCode, message } = smtpResponse

        if (code > SmtpResponseCode.OK) {
            throw new SmtpError(code, enhancedCode, message)
        }

        return smtpResponse
    }

    private async sendCommand(command: string): Promise<void> {
        ok(this.socket !== undefined, new Error('The client is no connected'))

        this.logger.debug(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`)
        await this.readResponse()
    }
}
