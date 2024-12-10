import type { ConnectThroughProxyOptions } from './connect-strategies'

function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

export async function connectThroughHttpProxy(options: ConnectThroughProxyOptions): Promise<void> {
    const { socket, host, port, proxy } = options
    const { host: proxyHost, port: proxyPort, user, password } = proxy
    const path = `${host}:${port}`

    const connectRequestLines = [`CONNECT ${path} HTTP/1.1`, `Host: ${path}`]

    if (user !== undefined && password !== undefined) {
        const credentials = generateAuthTokenFromCredentials(user, password)
        const proxyAuthorizationHeader = `Proxy-Authorization: Basic ${credentials}`
        connectRequestLines.push(proxyAuthorizationHeader)
    }

    const connectRequest = connectRequestLines.join('\r\n') + '\r\n\r\n'

    await new Promise<void>((resolve, reject) => {
        const onConnect = (): void => {
            socket.write(connectRequest, 'ascii', onWrite)
        }

        const onWrite = (error?: Error): void => {
            if (error != null) {
                socket.removeListener('data', onData)
                reject(error)
            }
        }

        const onData = (data: Buffer): void => {
            const response = data.toString()

            if (response.startsWith('HTTP/1.1 200')) {
                resolve()
            } else {
                socket.destroy()
            }
        }

        socket.once('data', onData)
        socket.connect(proxyPort, proxyHost, onConnect)
    })
}
