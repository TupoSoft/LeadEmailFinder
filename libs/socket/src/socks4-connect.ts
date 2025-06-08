import type { Socket } from 'node:net'
import { type ConnectThroughProxyOptions, directConnect } from './connect-strategies'
import { readBytes, write } from './stream'

export async function connectViaSocks4Proxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const SOCKS_VERSION = 0x04
    const CONNECT_COMMAND = 0x01
    const NULL = 0x00
    const STATUS_SUCCESS = 0x5a
    const IPV4_BYTES = 0x04
    const PORT_BYTES = 0x02

    const { host, port, proxy, signal } = options
    const { host: proxyHost, port: proxyPort, user = '' } = proxy

    const ipBytes = host.split('.').map(Number)
    if (ipBytes.length !== IPV4_BYTES) {
        throw new Error('Invalid IPv4 address for destination')
    }

    const socket = await directConnect({
        host: proxyHost,
        port: proxyPort,
        signal,
    })

    const portBuffer = Buffer.alloc(PORT_BYTES)
    portBuffer.writeUInt16BE(port)

    const userIdBuffer = Buffer.from(user, 'utf8')
    const request = Buffer.concat([
        Buffer.from([SOCKS_VERSION, CONNECT_COMMAND]),
        portBuffer,
        Buffer.from(ipBytes),
        userIdBuffer,
        Buffer.from([NULL]),
    ])

    await write(socket, request)

    const BYTES_TO_READ = 0x02
    const [, secondByte] = await readBytes(socket, BYTES_TO_READ)

    if (secondByte !== STATUS_SUCCESS) {
        const RADIX = 0x0f
        const error = `SOCKS4 request failed with status: 0x${secondByte.toString(RADIX)}`
        throw new Error(error)
    }

    return socket
}
