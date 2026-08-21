import type { Socket } from 'node:net'
import { connectThroughProxy, directConnect } from './connect-strategies'
import { createConnectionDeadline } from './connection-deadline'
import { IProxy } from './interfaces'

export interface ConnectOptions {
    host: string
    port: number
    socket?: Socket
    secure?: boolean
    timeout?: number
    proxy?: IProxy
    signal?: AbortSignal
    /**
     * Internal hook used by the connection-deadline helper to track the currently live socket so it can
     * be destroyed if the deadline or caller signal fires. Not for use by application code.
     */
    onSocket?: (socket: Socket) => void
}

export async function connect(options: ConnectOptions): Promise<Socket> {
    const { proxy, timeout, signal: callerSignal, host, port } = options
    const deadline = createConnectionDeadline({ host, port, timeout, signal: callerSignal })

    try {
        const effectiveOptions: ConnectOptions = { ...options, signal: deadline.signal, onSocket: deadline.track }

        return proxy != null
            ? await connectThroughProxy({ ...effectiveOptions, proxy })
            : await directConnect(effectiveOptions)
    } catch (error) {
        throw deadline.normalizeError(error)
    } finally {
        deadline.clear()
    }
}
