import type { NetConnectOpts, Socket } from 'node:net'
import { createConnection } from 'net'
import { isNetConnectOpts, isStringOrUndefined } from './type-guards'

export async function createConnectionAsync(path: string | NetConnectOpts): Promise<Socket>
export async function createConnectionAsync(port: number, host?: string): Promise<Socket>
export async function createConnectionAsync(arg1: unknown, arg2?: unknown): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
        const onConnect = (): void => {
            socket.off('error', onError)

            resolve(socket)
        }

        const onError = (err: Error): void => {
            socket.off('connect', onConnect)

            reject(err)
        }

        const createSocket = (): Socket => {
            if (typeof arg1 === 'number' && isStringOrUndefined(arg2)) {
                return createConnection(arg1, arg2, onConnect)
            } else if (typeof arg1 === 'string') {
                return createConnection(arg1, onConnect)
            } else if (isNetConnectOpts(arg1)) {
                return createConnection(arg1, onConnect)
            } else {
                throw new Error(`Arguments don't match any of the function signatures`)
            }
        }

        const socket = createSocket()
        socket.on('error', onError)
    })
}
