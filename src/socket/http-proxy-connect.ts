import { type IncomingMessage, request, type RequestOptions } from 'node:http'
import { ok } from 'node:assert'
import { constants } from 'node:http2'
import type { ConnectThroughProxyOptions } from './connect-strategies'
import type { Socket } from 'net'

function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

export async function connectThroughHttpProxy(options: ConnectThroughProxyOptions): Promise<void> {
    const { socket, host, port, proxy } = options
    const { host: proxyHost, port: proxyPort, user, password } = proxy
    const path = `${host}:${port}`

    await new Promise<void>((resolve, reject) => {
        const requestOptions: RequestOptions = {
            host: proxyHost,
            port: proxyPort,
            method: 'CONNECT',
            path,
            headers: {},
            createConnection: (options, oncreate) => {
                const { host, port } = options

                ok(typeof host === 'string')
                ok(typeof port === 'number')

                socket.connect(
                    {
                        host,
                        port,
                    },
                    () => {
                        oncreate(null, socket)
                    },
                )

                socket.once('error', error => {
                    oncreate(error, socket)
                })

                return socket
            },
        }

        ok(requestOptions.headers !== undefined, 'The headers object cannot be empty')

        if (user !== undefined && password !== undefined) {
            requestOptions.headers['Proxy-Authorization'] = 'Basic ' + generateAuthTokenFromCredentials(user, password)
        }

        const req = request(requestOptions)

        const connectListener = (res: IncomingMessage, poop: Socket): void => {
            if (res.statusCode !== constants.HTTP_STATUS_OK) {
                reject(
                    new Error(
                        `Failed to connect through proxy. Status code: ${res.statusCode}, message: ${res.statusMessage}`,
                    ),
                )
            } else {
                resolve()
            }

            req.removeListener('error', errorListener)
        }

        const errorListener = (err: Error): void => {
            console.debug(`Error: ${err.message}`)
            req.removeListener('connect', connectListener)
            reject(new Error(err.message))
        }

        req.once('error', errorListener)
        req.once('connect', connectListener)

        req.end()
    })
}
