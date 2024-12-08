import type { ConnectThroughProxyOptions } from './connect-strategies'

const SOCKS_VERSION = 0x04
const CONNECT_COMMAND = 0x01
const NULL = 0x00
const STATUS_SUCCESS = 0x5a

export async function connectViaSocks4Proxy(options: ConnectThroughProxyOptions): Promise<void> {
    const { socket, host, port, proxy } = options
    const { host: proxyHost, port: proxyPort, user = '' } = proxy

    await new Promise<void>((resolve, reject) => {
        socket.connect(
            {
                host: proxyHost,
                port: proxyPort,
            },
            () => {
                console.log('Connected to SOCKS4 proxy')

                const IPV4_BYTES = 4

                const ipBytes = host.split('.').map(Number)
                if (ipBytes.length !== IPV4_BYTES) {
                    reject(new Error('Invalid IPv4 address for destination'))
                    return
                }

                const PORT_BYTES = 2
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

                socket.write(request)

                socket.once('data', response => {
                    const [, secondByte] = response

                    if (secondByte !== STATUS_SUCCESS) {
                        const RADIX = 16
                        const error = `SOCKS4 request failed with status: 0x${secondByte.toString(RADIX)}`
                        reject(new Error(error))
                        return
                    }

                    console.log('SOCKS4 connection to target established')
                    resolve()
                })
            },
        )

        socket.on('error', err => {
            reject(err)
        })
    })
}
