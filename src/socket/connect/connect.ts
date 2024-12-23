import type { Socket } from 'node:net'
import { connectThroughProxy, directConnect } from './connect-strategies'
import type { Proxy } from '../../proxy'

export interface ConnectOptions {
    host: string
    port: number
    secure?: boolean
    timeout?: number
    proxy?: Proxy
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
