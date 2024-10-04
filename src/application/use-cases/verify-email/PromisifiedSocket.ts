import { type AddressInfo, Socket, type SocketConstructorOpts } from 'net'
import type { SocketConnectOpts, SocketReadyState } from 'node:net'

export interface PromisifiedSocketConstructorOpts extends SocketConstructorOpts {
    timeout?: number
}

const enum PromisifiedSocketErrorCode {
    ConnectFailed,
    WriteFailed,
    ReadFailed,
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

    protected readonly client: Socket

    private addressInfo: AddressInfo | undefined

    constructor(options?: PromisifiedSocketConstructorOpts) {
        this.client = new Socket(options)
        this.client.setTimeout(
            options?.timeout != null ? options.timeout : PromisifiedSocket.PROMISIFIED_SOCKET_DEFAULT_TIMEOUT,
        )
    }

    get address(): AddressInfo | undefined {
        if (this.addressInfo !== undefined) return this.addressInfo
        const address = this.client.address()
        return Object.keys(address).length !== 0 ? (address as AddressInfo) : undefined
    }

    set address(addressInfo) {
        if (addressInfo !== undefined) {
            this.addressInfo = addressInfo
        }
    }

    get readyState(): SocketReadyState {
        return this.client.readyState
    }

    async connect(options: SocketConnectOpts): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const connectionErrorListener = (err: Error): void => {
                console.debug('Connection error:', err)
                this.client.removeListener('connect', connectionListener)
                reject(new PromisifiedSocketError(PromisifiedSocketErrorCode.ConnectFailed, err.message))
            }

            const connectionListener = (): void => {
                if ('host' in options) {
                    console.debug(`Connected to server at ${options.host}:${options.port}`)
                }

                this.address = this.client.address() as AddressInfo

                resolve()
            }

            this.client.once('error', connectionErrorListener).connect(options, connectionListener)
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
}
