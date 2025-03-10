import type { Socket } from 'node:net'
import { type ConnectThroughProxyOptions, directConnect } from './connect-strategies'
import { ok } from 'node:assert'
import { readBytes, write } from './stream'

export async function connectViaSocks5Proxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const SOCKS_VERSION = 0x05
    const STATUS_SUCCESS = 0x00
    const SUBNEGOTIATION_VERSION = 0x01
    const AUTH_METHOD_COUNT = 0x01
    const AUTH_METHOD = 0x02
    const BYTES_TO_READ = 0x02
    const PORT_BYTES = 0x02
    const CONNECT_COMMAND = 0x01
    const RESERVED = 0x00
    const IPV4_ADDRESS_TYPE = 0x01

    const { host, proxy, port, signal } = options
    const { host: proxyHost, port: proxyPort, user, password } = proxy

    const socket = await directConnect({
        host: proxyHost,
        port: proxyPort,
        proxy,
        signal,
    })

    const handshake = Buffer.from([SOCKS_VERSION, AUTH_METHOD_COUNT, AUTH_METHOD])

    await write(socket, handshake)

    const [socksVersion, authMethod] = await readBytes(socket, BYTES_TO_READ)

    const authMethodNotAcceptedError = new Error('SOCKS5 authentication method not accepted')

    ok(socksVersion === SOCKS_VERSION, authMethodNotAcceptedError)
    ok(authMethod === AUTH_METHOD, authMethodNotAcceptedError)

    if (user != null && password != null) {
        const usernameBuffer = Buffer.from(user, 'utf8')
        const passwordBuffer = Buffer.from(password, 'utf8')

        const credentials = Buffer.concat([
            Buffer.from([SUBNEGOTIATION_VERSION]),
            Buffer.from([usernameBuffer.length]),
            usernameBuffer,
            Buffer.from([passwordBuffer.length]),
            passwordBuffer,
        ])

        await write(socket, credentials)

        const [subnegotiationVersion, status] = await readBytes(socket, BYTES_TO_READ)

        if (subnegotiationVersion !== SOCKS_VERSION || status !== STATUS_SUCCESS) {
            throw new Error('SOCKS5 authentication failed')
        }
    }

    const addressBuffer = Buffer.from(host.split('.').map(Number))
    const portBuffer = Buffer.alloc(PORT_BYTES)
    portBuffer.writeUInt16BE(port)

    const request = Buffer.concat([
        Buffer.from([SOCKS_VERSION, CONNECT_COMMAND, RESERVED, IPV4_ADDRESS_TYPE]),
        addressBuffer,
        portBuffer,
    ])

    await write(socket, request)

    const [, connectStatus] = await readBytes(socket, BYTES_TO_READ)
    ok(connectStatus === STATUS_SUCCESS, new Error('SOCKS5 connection request failed'))

    return socket
}
