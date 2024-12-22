import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls'
import { isStringOrUndefined, isTlsConnectionOptions } from './type-guards'

export async function tlsConnectAsync(options: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, host?: string, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(
    arg1: ConnectionOptions | number,
    arg2?: ConnectionOptions | string,
    arg3?: ConnectionOptions,
): Promise<TLSSocket> {
    return await new Promise<TLSSocket>((resolve, reject) => {
        const cleanup = (): void => {
            socket.off('secureConnect', onSecureConnect)
            socket.off('error', onError)
        }

        const onSecureConnect = (): void => {
            cleanup()
            resolve(socket)
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(err)
        }

        const createSocket = (): TLSSocket => {
            if (typeof arg1 === 'number') {
                if (isStringOrUndefined(arg2)) {
                    return connect(arg1, arg2, arg3, onSecureConnect)
                } else {
                    return connect(arg1, arg2, onSecureConnect)
                }
            } else if (isTlsConnectionOptions(arg1)) {
                return connect(arg1, onSecureConnect)
            } else {
                throw new Error(`Arguments don't match any of the function signatures`)
            }
        }

        const socket = createSocket()
        socket.on('error', onError)
    })
}
