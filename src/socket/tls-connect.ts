import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls'
import { isStringOrUndefined, isTlsConnectionOptions } from './type-guards'

export async function tlsConnectAsync(options: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(port: number, host?: string, options?: ConnectionOptions): Promise<TLSSocket>
export async function tlsConnectAsync(
    param1: ConnectionOptions | number,
    param2?: ConnectionOptions | string,
    param3?: ConnectionOptions,
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
            if (typeof param1 === 'number') {
                if (isStringOrUndefined(param2)) {
                    return connect(param1, param2, param3, onSecureConnect)
                } else {
                    return connect(param1, param2, onSecureConnect)
                }
            } else if (isTlsConnectionOptions(param1)) {
                return connect(param1, onSecureConnect)
            } else {
                throw new Error(`Arguments don't match any of the function signatures`)
            }
        }

        const socket = createSocket()
        socket.on('error', onError)
    })
}
