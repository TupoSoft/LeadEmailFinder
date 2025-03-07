import type { NetConnectOpts, Socket } from 'node:net'
import { once } from 'node:events'
import { isNetConnectOpts, isString } from './type-guards'

export async function connectAsync(socket: Socket, path: string | NetConnectOpts): Promise<Socket>
export async function connectAsync(socket: Socket, port: number, host?: string): Promise<Socket>
export async function connectAsync(
    socket: Socket,
    param1: number | string | NetConnectOpts,
    param2?: string,
): Promise<Socket> {
    if (typeof param1 === 'number' && isString(param2)) {
        socket.connect(param1, param2)
    } else if (isString(param1)) {
        socket.connect(param1)
    } else if (isNetConnectOpts(param1)) {
        socket.connect(param1)
    } else {
        throw new Error(`Arguments don't match any of the function signatures`)
    }

    await once(socket, 'connect')

    return socket
}
