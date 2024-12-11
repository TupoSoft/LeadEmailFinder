import { SMTP_RESPONSE_REGEX } from '../smtp/constants'
import type { SMTPResponseCode } from '../smtp/enums'
import { getSmtpResponseCode } from '../smtp/util'
import { Socket } from 'net'
import type { Proxy } from '../proxy'
import { connectThroughProxy, directConnect } from './connect-strategies'
import type { ConnectionLimiter } from '../smtp/connection-limiter'

export interface SocketWrapperConnectOptions {
    host: string
    port: number
    proxy?: Proxy
}

export class SocketWrapper {
    private address: string | undefined

    private targetExchange: string | undefined

    private buffer = ''

    private currentResponse: string[] = []

    private readonly commandQueue: Array<(response: string) => void> = []

    constructor(
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly signal?: AbortSignal,
        private readonly socket: Socket = new Socket({ signal }),
    ) {
        this.socket.on('data', this.onData.bind(this))
        this.socket.on('close', () => {
            if (this.address != null && this.targetExchange != null) {
                void this.connectionLimiter.release(this.address, this.targetExchange)
            }
            console.error('The socket is closed')
        })
    }

    async connect(options: SocketWrapperConnectOptions): Promise<void> {
        const { proxy, host } = options

        this.address = proxy != null ? proxy.host : 'localhost'

        const locked = await this.connectionLimiter.acquire(this.address, host, this.signal)

        if (locked) {
            this.targetExchange = host
        }

        if (proxy !== undefined) {
            await connectThroughProxy({ ...options, proxy, socket: this.socket })
        } else {
            await directConnect({ ...options, socket: this.socket })
        }
    }

    async getResponseCode(): Promise<SMTPResponseCode> {
        const response = await new Promise<string>(resolve => {
            this.commandQueue.push(resolve)
        })

        return getSmtpResponseCode(response)
    }

    async sendCommand(command: string): Promise<SMTPResponseCode> {
        console.debug(`Write: ${command}`)

        const response = await new Promise<string>((resolve, reject) => {
            this.commandQueue.push(resolve)
            this.socket.write(command + '\r\n', error => {
                if (error != null) {
                    reject(error)
                }
            })
        })

        return getSmtpResponseCode(response)
    }

    end(): void {
        this.socket.end()
    }

    private onData(buffer: Buffer): void {
        const data = buffer.toString()
        console.debug(`Data: ${data}`)

        this.buffer += data
        const lines = this.buffer.split('\r\n')
        this.buffer = lines.pop() ?? ''

        for (const line of lines) {
            const isMultiline = /^\d{3}-/.test(line)
            const isSmtp = SMTP_RESPONSE_REGEX.test(line)

            if (isSmtp) {
                this.currentResponse.push(line)
            }

            if (isSmtp && !isMultiline) {
                const callback = this.commandQueue.shift()

                if (callback != null) {
                    const response = this.currentResponse.join('\r\n')
                    this.currentResponse = []
                    callback(response)
                }
            }
        }
    }
}
