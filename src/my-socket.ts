import type { AddressInfo, Socket } from 'net'
import type { SocketReadyState, TcpNetConnectOpts, TcpSocketConnectOpts } from 'node:net'
import type { SocketConnector } from './socket-connector'

const enum PromisifiedSocketErrorCode {
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

class MySocketError extends Error {}

class MySocketFailedToEndError extends MySocketError {}

export interface MySocket {
    address: AddressInfo | undefined
    readyState: SocketReadyState
    connect: (options: TcpNetConnectOpts) => Promise<void>
    write: (message: string) => Promise<void>
    read: () => Promise<string>
    end: () => Promise<void>
}

export class PromisifiedSocket implements MySocket {
    private client: Socket | undefined

    constructor(private readonly socketConnector: SocketConnector) {}

    get address(): AddressInfo | undefined {
        return this.socketConnector.address
    }

    get readyState(): SocketReadyState {
        return this.client?.readyState ?? 'closed'
    }

    async connect(options: TcpSocketConnectOpts): Promise<void> {
        this.client = await this.socketConnector.connect(options)
    }

    async write(message: string): Promise<void> {
        console.debug(`Write: ${message}`)

        await new Promise<void>((resolve, reject) => {
            this.client?.write(message, err => {
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
                this.client?.removeListener('error', onError)
                resolve(read)
            }

            this.client?.once('error', onError)
            this.client?.once('data', onData)
        })
    }

    async end(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => {
                this.client?.removeListener('end', onEnd)
                reject(new MySocketFailedToEndError(error.message))
            }

            const onEnd = (): void => {
                console.debug('Disconnected from server')
                this.client?.removeListener('error', onEnd)
                resolve()
            }

            this.client?.once('error', onError)
            this.client?.end(onEnd)
        })
    }
}
