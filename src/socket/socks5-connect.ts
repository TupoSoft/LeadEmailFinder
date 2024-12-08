import type { ConnectThroughProxyOptions } from './connect-strategies'

const SOCKS_VERSION = 0x05
const STATUS_SUCCESS = 0x00
const SUBNEGOTIATION_VERSION = 0x01
const AUTH_METHOD = 0x02

export async function connectViaSocks5Proxy(options: ConnectThroughProxyOptions): Promise<void> {
    const { socket, host, proxy, port } = options
    const { host: proxyHost, port: proxyPort, user, password } = proxy

    await new Promise<void>((resolve, reject) => {
        const onConnectToProxy = (): void => {
            console.log('Connected to SOCKS5 proxy')

            const AUTH_METHOD_COUNT = 0x01

            const handshake = Buffer.from([SOCKS_VERSION, AUTH_METHOD_COUNT, AUTH_METHOD])
            socket.write(handshake)

            socket.once('data', onHandshakeData)
        }

        const onHandshakeData = (data: Buffer): void => {
            const [firstByte, secondByte] = data

            if (firstByte !== SOCKS_VERSION || secondByte !== AUTH_METHOD) {
                reject(new Error('SOCKS5 authentication method not accepted'))
                return
            }

            console.log('Authentication method accepted')

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

                socket.write(credentials)

                socket.once('data', onAuthData)
            }
        }

        const onAuthData = (data: Buffer): void => {
            const [firstByte, secondByte] = data

            if (firstByte !== SUBNEGOTIATION_VERSION || secondByte !== STATUS_SUCCESS) {
                reject(new Error('SOCKS5 authentication failed'))
                return
            }

            console.log('Authentication successful')

            const PORT_BYTES = 2

            const addressBuffer = Buffer.from(host.split('.').map(Number))
            const portBuffer = Buffer.alloc(PORT_BYTES)
            portBuffer.writeUInt16BE(port)

            const CONNECT_COMMAND = 0x01
            const RESERVED = 0x00
            const IPV4_ADDRESS_TYPE = 0x01

            const request = Buffer.concat([
                Buffer.from([SOCKS_VERSION, CONNECT_COMMAND, RESERVED, IPV4_ADDRESS_TYPE]),
                addressBuffer,
                portBuffer,
            ])

            socket.write(request)

            socket.once('data', onConnectToHostData)
        }

        const onConnectToHostData = (data: Buffer): void => {
            const [firstByte, secondByte] = data

            if (firstByte !== SOCKS_VERSION || secondByte !== STATUS_SUCCESS) {
                reject(new Error('SOCKS5 connection request failed'))
                return
            }

            console.log('Connection to target established through proxy')
            resolve()
        }

        socket.connect(
            {
                host: proxyHost,
                port: proxyPort,
            },
            onConnectToProxy,
        )

        socket.on('error', reject)
    })
}
