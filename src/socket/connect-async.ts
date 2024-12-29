import type { NetConnectOpts, Socket } from 'node:net'
import { isNetConnectOpts, isString } from './type-guards'

export async function connectAsync(socket: Socket, path: string | NetConnectOpts): Promise<Socket>
export async function connectAsync(socket: Socket, port: number, host?: string): Promise<Socket>
export async function connectAsync(
    socket: Socket,
    param1: number | string | NetConnectOpts,
    param2?: string,
): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
        const cleanup = (): void => {
            socket.off('error', onError)
            socket.off('connect', onConnect)
        }

        const onConnect = (): void => {
            cleanup()
            resolve(socket)
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(err)
        }

        if (typeof param1 === 'number' && isString(param2)) {
            socket.connect(param1, param2, onConnect)
        } else if (isString(param1)) {
            socket.connect(param1, onConnect)
        } else if (isNetConnectOpts(param1)) {
            socket.connect(param1, onConnect)
        } else {
            throw new Error(`Arguments don't match any of the function signatures`)
        }

        socket.on('error', onError)
    })
}
