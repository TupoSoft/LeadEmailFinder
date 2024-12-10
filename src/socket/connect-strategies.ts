import type { Proxy } from '../proxy'
import type { Socket } from 'net'
import { connectThroughHttpProxy } from './http-proxy-connect'
import { connectViaSocks4Proxy } from './socks4-connect'
import { connectViaSocks5Proxy } from './socks5-connect'

export interface ConnectOptions {
    socket: Socket
    host: string
    port: number
}

export interface ConnectThroughProxyOptions extends ConnectOptions {
    proxy: Proxy
}

export async function connectThroughProxy(options: ConnectThroughProxyOptions): Promise<void> {
    const { proxy } = options

    switch (proxy.type) {
        case 'http':
            await connectThroughHttpProxy(options)
            break
        case 'socks4':
            await connectViaSocks4Proxy(options)
            break
        case 'socks5':
            await connectViaSocks5Proxy(options)
    }
}

export async function directConnect(options: ConnectOptions): Promise<void> {
    const { socket, host, port } = options

    await new Promise<void>((resolve, reject) => {
        const errorListener = (err: Error): void => {
            socket.removeListener('error', connectListener)
            reject(err)
        }

        const connectListener = (): void => {
            socket.removeListener('error', errorListener)
            resolve()
        }

        socket.connect(
            {
                port,
                host,
            },
            connectListener,
        )

        socket.once('error', errorListener)
    })
}
