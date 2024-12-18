import type { Proxy } from '../../proxy'
import type { Socket } from 'node:net'
import { connectThroughHttpProxy } from './http-proxy-connect'
import { connectViaSocks4Proxy } from './socks4-connect'
import { connectViaSocks5Proxy } from './socks5-connect'
import type { ConnectOptions } from './connect'
import { createConnectionAsync } from '../create-connection-async'

export interface ConnectThroughProxyOptions extends ConnectOptions {
    proxy: Proxy
}

export async function connectThroughProxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const { proxy } = options

    switch (proxy.type) {
        case 'http':
            return await connectThroughHttpProxy(options)
        case 'socks4':
            return await connectViaSocks4Proxy(options)
        case 'socks5':
            return await connectViaSocks5Proxy(options)
    }
}

export async function directConnect(options: ConnectOptions): Promise<Socket> {
    const { host, port, signal } = options

    return await createConnectionAsync({
        host,
        port,
        signal,
    })
}
