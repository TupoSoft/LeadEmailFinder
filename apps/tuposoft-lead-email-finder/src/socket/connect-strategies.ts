import type { Socket } from 'node:net'
import { connectThroughHttpProxy } from './http-proxy-connect'
import { connectViaSocks4Proxy } from './socks4-connect'
import { connectViaSocks5Proxy } from './socks5-connect'
import type { ConnectOptions } from './connect'
import { createConnectionAsync } from './create-connection-async'
import { tlsConnectAsync } from './tls-connect'
import { connectAsync } from './connect-async'
import { IProxy } from './interfaces'

export interface ConnectThroughProxyOptions extends ConnectOptions {
    proxy: IProxy
}

export async function connectThroughProxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const {
        proxy: { type },
    } = options

    switch (type) {
        case 'http':
        case 'https':
            return await connectThroughHttpProxy(options)
        case 'socks4':
            return await connectViaSocks4Proxy(options)
        case 'socks5':
            return await connectViaSocks5Proxy(options)
    }
}

export async function directConnect(options: ConnectOptions): Promise<Socket> {
    const { host, port, socket: existingSocket, signal, secure } = options

    const netConnectOptions = {
        host,
        port,
        signal,
    }

    const socket =
        existingSocket !== undefined
            ? await connectAsync(existingSocket, netConnectOptions)
            : await createConnectionAsync(netConnectOptions)

    return secure === true ? await tlsConnectAsync({ socket }) : socket
}
