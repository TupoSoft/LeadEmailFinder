import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls'
import { isConnectionOptions, isStringOrUndefined } from './type-guards'
import { once } from 'node:events'

export async function tlsConnectAsync(options: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, host?: string, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(
    param1: ConnectionOptions | number,
    param2?: ConnectionOptions | string,
    param3?: ConnectionOptions,
): Promise<TLSSocket> {
    const createSocket = (): TLSSocket => {
        if (typeof param1 === 'number') {
            if (isStringOrUndefined(param2)) {
                return connect(param1, param2, param3)
            } else {
                return connect(param1, param2)
            }
        } else if (isConnectionOptions(param1)) {
            return connect(param1)
        } else {
            throw new Error(`Arguments don't match any of the function signatures`)
        }
    }

    const socket = createSocket()
    await once(socket, 'secureConnect')
    return socket
}
