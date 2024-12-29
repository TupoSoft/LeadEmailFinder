import type { NetConnectOpts, Socket } from 'node:net'
import { createConnection } from 'net'
import { isNetConnectOpts, isStringOrUndefined } from './type-guards'

export async function createConnectionAsync(path: string | NetConnectOpts): Promise<Socket>
export async function createConnectionAsync(port: number, host?: string): Promise<Socket>
export async function createConnectionAsync(
    param1: NetConnectOpts | string | number,
    param2?: string,
): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
        const cleanup = (): void => {
            socket.off('connect', onConnect)
            socket.off('error', onError)
        }

        const onConnect = (): void => {
            cleanup()
            resolve(socket)
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(err)
        }

        const createSocket = (): Socket => {
            if (typeof param1 === 'number' && isStringOrUndefined(param2)) {
                return createConnection(param1, param2, onConnect)
            } else if (typeof param1 === 'string') {
                return createConnection(param1, onConnect)
            } else if (isNetConnectOpts(param1)) {
                return createConnection(param1, onConnect)
            } else {
                throw new Error(`Arguments don't match any of the function signatures`)
            }
        }

        const socket = createSocket()
        socket.on('error', onError)
    })
}
