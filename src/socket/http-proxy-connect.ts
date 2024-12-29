import type { Socket } from 'node:net'
import { type ConnectThroughProxyOptions, directConnect } from './connect-strategies'
import { readUntil, write } from '../stream'

function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

export async function connectThroughHttpProxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const { host, port, signal, proxy, socket: existingSocket } = options
    const { type, host: proxyHost, port: proxyPort, user, password } = proxy
    const path = `${host}:${port}`

    const socket = await directConnect({
        socket: existingSocket,
        secure: type === 'https',
        host: proxyHost,
        port: proxyPort,
        signal,
    })

    const connectRequestLines = [`CONNECT ${path} HTTP/1.1`, `Host: ${path}`]

    if (user !== undefined && password !== undefined) {
        const credentials = generateAuthTokenFromCredentials(user, password)
        const proxyAuthorizationHeader = `Proxy-Authorization: Basic ${credentials}`
        connectRequestLines.push(proxyAuthorizationHeader)
    }

    const connectRequest = connectRequestLines.join('\r\n') + '\r\n\r\n'

    await write(socket, connectRequest)

    await readUntil(socket, 'HTTP/1.1 200 Connection established\r\n\r\n')

    return socket
}
