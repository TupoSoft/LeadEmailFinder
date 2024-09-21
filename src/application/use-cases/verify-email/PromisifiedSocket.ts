import { type AddressInfo, Socket, type SocketConstructorOpts, type TcpSocketConnectOpts } from 'net'
import type { SocketReadyState } from 'node:net'

interface PromisifiedSocketConstructorOpts extends SocketConstructorOpts {
    timeout?: number
}

interface PromisifiedSocketConnectOpts extends TcpSocketConnectOpts {
    proxy?: ProxyData
}

export interface ProxyData {
    host: string
    port: number
    user?: string
    password?: string
}

const enum PromisifiedSocketErrorCode {
    ConnectFailed,
    ConnectToProxyFailed,
    ProxyNotSet,
    WriteFailed,
    ReadFailed,
    SocketDestroyed,
}

class PromisifiedSocketError extends Error {
    constructor(
        readonly code: PromisifiedSocketErrorCode,
        readonly message: string,
    ) {
        super(message)
    }
}

export class PromisifiedSocket {
    private static readonly PROMISIFIED_SOCKET_DEFAULT_TIMEOUT = 300000 // 5 minutes

    private readonly client: Socket
    private addressInfo?: AddressInfo

    constructor(options?: PromisifiedSocketConstructorOpts) {
        this.client = new Socket(options)
        this.client.setTimeout(
            options?.timeout != null ? options.timeout : PromisifiedSocket.PROMISIFIED_SOCKET_DEFAULT_TIMEOUT,
        )
    }

    private static generateAuthTokenFromCredentials(user: string, password: string): string {
        return Buffer.from(`${user}:${password}`).toString('base64')
    }

    async connect(options: PromisifiedSocketConnectOpts): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const { proxy, host: targetHost, port: targetPort } = options

            const connectionErrorListener = (err: Error): void => {
                console.debug('Connection error:', err)
                this.client.removeListener('connect', connectionListener)
                reject(new PromisifiedSocketError(PromisifiedSocketErrorCode.ConnectFailed, err.message))
            }

            const proxyConnectionErrorListener = (err: Error): void => {
                console.debug('Connection error:', err)
                this.client.removeListener('connect', proxyConnectionListener)
                reject(new PromisifiedSocketError(PromisifiedSocketErrorCode.ConnectToProxyFailed, err.message))
            }

            const connectionListener = (): void => {
                console.debug(`Connected to server at ${options.host}:${options.port}`)

                this.addressInfo = this.client.address() as AddressInfo

                resolve()
            }

            const proxyConnectionListener = (): void => {
                if (proxy === undefined) {
                    reject(
                        new PromisifiedSocketError(
                            PromisifiedSocketErrorCode.ProxyNotSet,
                            'Trying to connect to a proxy which is not set.',
                        ),
                    )
                    return
                }

                const { host: proxyHost, port: proxyPort, user, password } = proxy

                console.debug(`Connection to proxy ${proxyHost}:${proxyPort} established successfully`)

                const remoteFamily = this.client.remoteFamily
                if (remoteFamily === undefined) {
                    reject(
                        new PromisifiedSocketError(
                            PromisifiedSocketErrorCode.SocketDestroyed,
                            `The socket is destroyed.`,
                        ),
                    )
                    return
                }

                this.addressInfo = {
                    address: proxyHost,
                    port: proxyPort,
                    family: remoteFamily,
                }

                const connectRequest =
                    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                    `Host: ${targetHost}:${targetPort}\r\n` +
                    (user != null && password != null
                        ? `Proxy-Authorization: Basic ${PromisifiedSocket.generateAuthTokenFromCredentials(user, password)}\r\n`
                        : '') +
                    '\r\n'

                this.client.write(connectRequest, err => {
                    if (err == null) {
                        this.client.once('data', data => {
                            const response = data.toString()
                            console.debug(`Read: ${response}`)

                            if (response.includes('HTTP/1.1 200 Connection established')) {
                                console.debug(
                                    `Connection to target server ${targetHost}:${targetPort} established successfully.`,
                                )
                                this.client.removeListener('error', connectionErrorListener)
                                resolve()
                            } else {
                                this.end()
                                reject(
                                    new PromisifiedSocketError(
                                        PromisifiedSocketErrorCode.ConnectFailed,
                                        `Failed to connect to ${targetHost}:${targetPort}`,
                                    ),
                                )
                            }
                        })
                    }
                })
            }

            const connectionHandler = proxy != null ? proxyConnectionListener : connectionListener
            const errorListener = proxy != null ? proxyConnectionErrorListener : connectionErrorListener

            if (proxy != null) {
                options.host = proxy.host
                options.port = proxy.port
            }

            this.client.connect(options, connectionHandler).once('error', errorListener)
        })
    }

    async write(message: string): Promise<void> {
        console.debug(`Write: ${message}`)

        await new Promise<void>((resolve, reject) => {
            this.client.write(message, err => {
                if (err != null) {
                    reject(new PromisifiedSocketError(PromisifiedSocketErrorCode.WriteFailed, err.message))
                } else {
                    resolve()
                }
            })
        })
    }

    async read(): Promise<string> {
        return await new Promise((resolve, reject) => {
            const onError = (error: Error): void => {
                reject(new PromisifiedSocketError(PromisifiedSocketErrorCode.ReadFailed, error.message))
            }

            const onData = (data: Buffer): void => {
                const read = data.toString()
                console.debug(`Read: ${read}`)
                this.client.removeListener('error', onError)
                resolve(read)
            }

            this.client.once('data', onData).once('error', onError)
        })
    }

    end(): void {
        this.client.end()
        console.debug('Disconnected from server')
    }

    getAddressInfo(): AddressInfo | undefined {
        return this.addressInfo
    }

    getReadyState(): SocketReadyState {
        return this.client.readyState
    }
}
