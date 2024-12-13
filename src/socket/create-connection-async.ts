import type { NetConnectOpts, Socket } from 'node:net'
import { createConnection } from 'net'

function isStringOrUndefined(value: unknown): value is string | undefined {
    return typeof value === 'undefined' || typeof value === 'string'
}

export function isNetConnectOpts(value: unknown): value is NetConnectOpts {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const hasPort = typeof (value as { port?: unknown }).port === 'number'
    const hasPath = typeof (value as { path?: unknown }).path === 'string'

    return hasPort || hasPath
}

export async function createConnectionAsync(path: string | NetConnectOpts): Promise<Socket>
export async function createConnectionAsync(port: number, host?: string): Promise<Socket>
export async function createConnectionAsync(arg1: unknown, arg2?: unknown): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
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

        const onConnect = (): void => {
            socket.off('error', onError)

            resolve(socket)
        }

        const onError = (err: Error): void => {
            socket.off('connect', onConnect)

            reject(err)
        }

        socket.on('error', onError)
    })
}
