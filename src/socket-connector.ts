import { type AddressInfo, createConnection, type Socket, type TcpNetConnectOpts } from 'node:net'
import { type IncomingMessage, request, type RequestOptions } from 'node:http'

export interface ProxyOpts {
    host: string
    port: number
    type: 'http' | 'socks5'
    user?: string
    password?: string
}

export class SocketConnectorError extends Error {}

export interface SocketConnector {
    connect: (options: TcpNetConnectOpts) => Promise<Socket>
    address: AddressInfo | undefined
}

export class DirectSocketConnectionFailedError extends SocketConnectorError {}

export class DirectSocketConnector implements SocketConnector {
    address: AddressInfo | undefined

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    async connect(options: TcpNetConnectOpts): Promise<Socket> {
        return await new Promise<Socket>((resolve, reject) => {
            const errorListener = (err: Error): void => {
                socket.removeListener('error', connectListener)
                reject(new DirectSocketConnectionFailedError(err.message))
            }

            const connectListener = (): void => {
                if ('host' in options) {
                    console.debug(`Connected to server at ${options.host}:${options.port}`)
                }

                socket.removeListener('error', errorListener)

                const address = socket.address()

                this.address = 'address' in address ? address : undefined

                if (this.address == null) {
                    reject(new DirectSocketConnectionFailedError(`The socket is destroyed!`))
                }

                resolve(socket)
            }

            const socket = createConnection(options, connectListener)

            socket.once('error', errorListener)
        })
    }
}

export class ProxySocketConnectionFailedError extends SocketConnectorError {}

export class ProxySocketConnector implements SocketConnector {
    address: AddressInfo | undefined

    constructor(private readonly proxyOpts: ProxyOpts) {}

    async connect(options: TcpNetConnectOpts): Promise<Socket> {
        const { host: proxyHost, port: proxyPort, user, password } = this.proxyOpts
        const { host, port } = options
        const path = `${host}:${port}`

        return await new Promise<Socket>((resolve, reject) => {
            const requestOptions: RequestOptions = {
                host: proxyHost,
                port: proxyPort,
                method: 'CONNECT',
                path,
                headers: {},
            }

            if (user !== undefined && password !== undefined && requestOptions.headers !== undefined) {
                requestOptions.headers['Proxy-Authorization'] = 'Basic ' + this.generateAuthTokenFromCredentials()
            }

            const req = request(requestOptions)

            const connectListener = (res: IncomingMessage, socket: Socket): void => {
                if (res.statusCode !== 200) {
                    reject(
                        new ProxySocketConnectionFailedError(
                            `Failed to connect through proxy. Status code: ${res.statusCode}, message: ${res.statusMessage}`,
                        ),
                    )
                } else {
                    resolve(socket)

                    if (socket.remoteFamily != null) {
                        this.address = {
                            address: proxyHost,
                            port: proxyPort,
                            family: socket.remoteFamily,
                        }
                    } else {
                        reject(new ProxySocketConnectionFailedError(`The socket is destroyed!`))
                    }
                }

                req.removeListener('error', errorListener)
            }

            const errorListener = (err: Error): void => {
                req.removeListener('connect', connectListener)
                reject(new ProxySocketConnectionFailedError(err.message))
            }

            req.once('error', errorListener)
            req.once('connect', connectListener)

            req.end()
        })
    }

    private generateAuthTokenFromCredentials(): string {
        const { user, password } = this.proxyOpts
        return Buffer.from(`${user}:${password}`).toString('base64')
    }
}
