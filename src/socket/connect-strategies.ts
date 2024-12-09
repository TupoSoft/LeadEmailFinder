import type { Proxy } from '../proxy'

export interface ConnectOptions {
    host: string
    port: number
}

export interface ConnectThroughProxyOptions extends ConnectOptions {
    proxy: Proxy
}

// export async function connectThroughProxy(options: ConnectThroughProxyOptions): Promise<void> {
//     const { proxy } = options
//
//     switch (proxy.type) {
//         case 'http':
//             await connectThroughHttpProxy(options)
//             break
//         case 'socks4':
//             await connectViaSocks4Proxy(options)
//             break
//         case 'socks5':
//             await connectViaSocks5Proxy(options)
//     }
// }
//
// export async function connect(options: ConnectOptions): Promise<void> {
//     const { socket, host, port } = options
//
//     await new Promise<void>((resolve, reject) => {
//         const errorListener = (err: Error): void => {
//             socket.removeListener('error', connectListener)
//             reject(err)
//         }
//
//         const connectListener = (): void => {
//             socket.removeListener('error', errorListener)
//             resolve()
//         }
//
//         socket.connect(
//             {
//                 port,
//                 host,
//             },
//             connectListener,
//         )
//
//         socket.once('error', errorListener)
//     })
// }
