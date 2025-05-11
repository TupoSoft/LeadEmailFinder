import type { Socket } from 'node:net'
import { connectThroughProxy, directConnect } from './connect-strategies'
import { IProxy } from './interfaces'

export interface ConnectOptions {
    host: string
    port: number
    socket?: Socket
    secure?: boolean
    timeout?: number
    proxy?: IProxy
    signal?: AbortSignal
}

export async function connect(options: ConnectOptions): Promise<Socket> {
    const { proxy } = options

    if (proxy != null) {
        return await connectThroughProxy({ ...options, proxy })
    } else {
        return await directConnect(options)
    }
}
