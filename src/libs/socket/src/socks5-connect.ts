import { isIP, type Socket } from 'node:net'
import { type ConnectThroughProxyOptions, directConnect } from './connect-strategies'
import { ok } from 'node:assert'
import { readBytes, write } from './stream'

const SOCKS_VERSION = 0x05
const STATUS_SUCCESS = 0x00
const SUBNEGOTIATION_VERSION = 0x01
const USERNAME_PASSWORD_AUTH_METHOD = 0x02
const CONNECT_COMMAND = 0x01
const RESERVED = 0x00

enum SocksAddressType {
    IPv4 = 0x01,
    Domain = 0x03,
    IPv6 = 0x04,
}

export async function connectViaSocks5Proxy(options: ConnectThroughProxyOptions): Promise<Socket> {
    const AUTH_METHOD_COUNT = 0x01
    const BYTES_TO_READ = 0x02
    const PORT_BYTES = 0x02

    const { host, proxy, port, signal, socket: existingSocket } = options
    const { host: proxyHost, port: proxyPort, user, password } = proxy

    ok(user != null && password != null, new Error('SOCKS5 proxy credentials are required'))

    const socket = await directConnect({
        host: proxyHost,
        port: proxyPort,
        proxy,
        signal,
        socket: existingSocket,
    })

    const handshake = Buffer.from([SOCKS_VERSION, AUTH_METHOD_COUNT, USERNAME_PASSWORD_AUTH_METHOD])

    await write(socket, handshake)

    const [socksVersion, authMethod] = await readBytes(socket, BYTES_TO_READ)

    const authMethodNotAcceptedError = new Error('SOCKS5 authentication method not accepted')

    ok(socksVersion === SOCKS_VERSION, authMethodNotAcceptedError)
    ok(authMethod === USERNAME_PASSWORD_AUTH_METHOD, authMethodNotAcceptedError)

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

    if (subnegotiationVersion !== SUBNEGOTIATION_VERSION || status !== STATUS_SUCCESS) {
        throw new Error('SOCKS5 authentication failed')
    }

    const { addressType, addressBuffer } = encodeAddress(host)
    const portBuffer = Buffer.alloc(PORT_BYTES)
    portBuffer.writeUInt16BE(port)

    const request = Buffer.concat([
        Buffer.from([SOCKS_VERSION, CONNECT_COMMAND, RESERVED, addressType]),
        addressBuffer,
        portBuffer,
    ])

    await write(socket, request)

    const [responseVersion, connectStatus, reserved, responseAddressType] = await readBytes(socket, 4)
    ok(responseVersion === SOCKS_VERSION, new Error('Invalid SOCKS5 connection response'))
    ok(connectStatus === STATUS_SUCCESS, new Error('SOCKS5 connection request failed'))
    ok(reserved === RESERVED, new Error('Invalid SOCKS5 connection response'))

    await consumeBoundAddress(socket, responseAddressType as SocksAddressType)
    await readBytes(socket, PORT_BYTES)

    return socket
}

function encodeAddress(host: string): { addressType: SocksAddressType; addressBuffer: Buffer } {
    const addressType = isIP(host)

    if (addressType === 4) {
        return {
            addressType: SocksAddressType.IPv4,
            addressBuffer: Buffer.from(host.split('.').map(Number)),
        }
    }

    ok(addressType !== 6, new Error('SOCKS5 IPv6 targets are not supported'))

    const domainBuffer = Buffer.from(host, 'utf8')
    ok(domainBuffer.length <= 255, new Error('SOCKS5 target hostname is too long'))

    return {
        addressType: SocksAddressType.Domain,
        addressBuffer: Buffer.concat([Buffer.from([domainBuffer.length]), domainBuffer]),
    }
}

async function consumeBoundAddress(socket: Socket, addressType: SocksAddressType): Promise<void> {
    switch (addressType) {
        case SocksAddressType.IPv4:
            await readBytes(socket, 4)
            return
        case SocksAddressType.IPv6:
            await readBytes(socket, 16)
            return
        case SocksAddressType.Domain: {
            const [domainLength] = await readBytes(socket, 1)
            await readBytes(socket, domainLength)
            return
        }
        default:
            throw new Error('Unsupported SOCKS5 response address type')
    }
}
