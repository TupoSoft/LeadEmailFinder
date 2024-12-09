import { SMTP_RESPONSE_REGEX } from '../smtp/constants'
import type { SMTPResponseCode } from '../smtp/enums'
import { getSmtpResponseCode } from '../smtp/util'
import type { Socket } from 'net'
import type { ConnectOptions, ConnectThroughProxyOptions } from './connect-strategies'
import { type IncomingMessage, request, type RequestOptions } from 'node:http'
import { ok } from 'node:assert'
import { constants } from 'node:http2'
import type { Proxy } from '../proxy'

function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

export interface SocketWrapperConnectOptions {
    host: string
    port: number
    proxy?: Proxy
}

export class SocketWrapper {
    private buffer = ''

    private currentResponse: string[] = []

    private readonly commandQueue: Array<(response: string) => void> = []

    constructor(private readonly socket: Socket) {}

    async connect(options: SocketWrapperConnectOptions): Promise<void> {
        const { proxy } = options

        if (proxy !== undefined) {
            await this.connectThroughHttpProxy({ ...options, proxy })
        } else {
            await this.directConnect(options)
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

    private async directConnect(options: ConnectOptions): Promise<void> {
        const { host, port } = options

        await new Promise<void>((resolve, reject) => {
            const errorListener = (err: Error): void => {
                this.socket.removeListener('error', connectListener)
                reject(err)
            }

            const connectListener = (): void => {
                this.socket.removeListener('error', errorListener)
                resolve()
            }

            this.socket.connect(
                {
                    port,
                    host,
                },
                connectListener,
            )

            this.socket.once('error', errorListener)
        })
    }

    private async connectThroughHttpProxy(options: ConnectThroughProxyOptions): Promise<void> {
        const { host, port, proxy } = options
        const { host: proxyHost, port: proxyPort, user, password } = proxy
        const path = `${host}:${port}`

        await new Promise<void>((resolve, reject) => {
            const requestOptions: RequestOptions = {
                host: proxyHost,
                port: proxyPort,
                method: 'CONNECT',
                path,
                headers: {},
                createConnection: (options, oncreate) => {
                    const { host, port } = options

                    ok(typeof host === 'string')
                    ok(typeof port === 'number')

                    this.socket.connect(
                        {
                            host,
                            port,
                        },
                        () => {
                            oncreate(null, this.socket)
                        },
                    )

                    this.socket.once('error', error => {
                        oncreate(error, this.socket)
                    })

                    return this.socket
                },
            }

            ok(requestOptions.headers !== undefined, 'The headers object cannot be empty')

            if (user !== undefined && password !== undefined) {
                requestOptions.headers['Proxy-Authorization'] =
                    'Basic ' + generateAuthTokenFromCredentials(user, password)
            }

            const req = request(requestOptions)

            const connectListener = (res: IncomingMessage, socket: Socket): void => {
                this.socket.on('data', this.onData.bind(this))

                if (res.statusCode !== constants.HTTP_STATUS_OK) {
                    reject(
                        new Error(
                            `Failed to connect through proxy. Status code: ${res.statusCode}, message: ${res.statusMessage}`,
                        ),
                    )
                } else {
                    resolve()
                }

                req.removeListener('error', errorListener)
            }

            const errorListener = (err: Error): void => {
                console.debug(`Error: ${err.message}`)
                req.removeListener('connect', connectListener)
                reject(new Error(err.message))
            }

            req.once('error', errorListener)
            req.once('connect', connectListener)

            req.end()
        })
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
