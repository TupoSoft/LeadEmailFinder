import { PromisifiedSocket, type PromisifiedSocketConstructorOpts } from './PromisifiedSocket'
import type { TcpSocketConnectOpts } from 'node:net'

export interface ProxyOpts {
    host: string
    port: number
    user?: string
    password?: string
}

export interface ProxySocketConstructorOpts extends PromisifiedSocketConstructorOpts {
    proxy: ProxyOpts
}

export class ProxySocketConnectError extends Error {}

export class ProxySocketDestroyedError extends Error {}

export class ProxySocket extends PromisifiedSocket {
    constructor(private readonly options: ProxySocketConstructorOpts) {
        super(options)
    }

    private static generateAuthTokenFromCredentials(user: string, password: string): string {
        return Buffer.from(`${user}:${password}`).toString('base64')
    }

    async connect(options: TcpSocketConnectOpts): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const {
                proxy: { host: proxyHost, port: proxyPort, user, password },
            } = this.options

            const connectionErrorListener = (err: Error): void => {
                console.debug('Connection error:', err)
                this.client.removeListener('connect', connectionListener)
                reject(new ProxySocketConnectError(err.message))
            }

            const connectionListener = (): void => {
                const { host: targetHost, port: targetPort } = options

                console.debug(`Connection to proxy ${proxyHost}:${proxyPort} established successfully`)

                const remoteFamily = this.client.remoteFamily
                if (remoteFamily === undefined) {
                    reject(new ProxySocketDestroyedError('The socket is destroyed.'))
                    return
                }

                this.address = {
                    address: proxyHost,
                    port: proxyPort,
                    family: remoteFamily,
                }

                const connectRequest =
                    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                    `Host: ${targetHost}:${targetPort}\r\n` +
                    (user != null && password != null
                        ? `Proxy-Authorization: Basic ${ProxySocket.generateAuthTokenFromCredentials(user, password)}\r\n`
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
                                reject(new ProxySocketConnectError(`Failed to connect to ${targetHost}:${targetPort}`))
                            }
                        })
                    }
                })
            }

            this.client.once('error', connectionErrorListener).connect(
                {
                    ...options,
                    host: proxyHost,
                    port: proxyPort,
                },
                connectionListener,
            )
        })
    }
}
