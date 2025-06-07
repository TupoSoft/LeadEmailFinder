import type { NetConnectOpts, Socket } from 'node:net'
import { createConnection } from 'net'
import { isNetConnectOpts, isStringOrUndefined } from './type-guards'
import { once } from 'node:events'

export async function createConnectionAsync(path: string | NetConnectOpts): Promise<Socket>
export async function createConnectionAsync(port: number, host?: string): Promise<Socket>
export async function createConnectionAsync(
    param1: NetConnectOpts | string | number,
    param2?: string,
): Promise<Socket> {
    const createSocket = (): Socket => {
        if (typeof param1 === 'number' && isStringOrUndefined(param2)) {
            return createConnection(param1, param2)
        } else if (typeof param1 === 'string') {
            return createConnection(param1)
        } else if (isNetConnectOpts(param1)) {
            return createConnection(param1)
        } else {
            throw new Error(`Arguments don't match any of the function signatures`)
        }
    }

    const socket = createSocket()
    await once(socket, 'connect')
    return socket
}
