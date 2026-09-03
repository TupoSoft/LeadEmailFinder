import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls'
import { isConnectionOptions, isStringOrUndefined } from './type-guards'
import { once } from 'node:events'

export async function tlsConnectAsync(options: ConnectionOptions, signal?: AbortSignal): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, host?: string, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(
    param1: ConnectionOptions | number,
    param2?: AbortSignal | ConnectionOptions | string,
    param3?: ConnectionOptions,
): Promise<TLSSocket> {
    let signal: AbortSignal | undefined

    const createSocket = (): TLSSocket => {
        if (typeof param1 === 'number') {
            if (isStringOrUndefined(param2)) {
                return connect(param1, param2, param3)
            } else {
                return connect(param1, param2 as ConnectionOptions)
            }
        } else if (isConnectionOptions(param1)) {
            signal = param2 instanceof AbortSignal ? param2 : undefined
            return connect(param1)
        } else {
            throw new Error(`Arguments don't match any of the function signatures`)
        }
    }

    const socket = createSocket()

    try {
        await once(socket, 'secureConnect', { signal })
        return socket
    } catch (error) {
        if (!socket.destroyed) {
            socket.destroy()
        }
        const rawSocket = isConnectionOptions(param1) ? param1.socket : undefined
        if (rawSocket != null && !rawSocket.destroyed) {
            rawSocket.destroy()
        }
        throw error
    }
}
