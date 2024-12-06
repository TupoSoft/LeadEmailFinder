import { SMTPResponseCode } from './enums'
import { SMTPClientError, SMTPClientErrorCode } from './errors'
import { type Socket } from 'net'
import { DirectSocketConnectionFailedError, type ProxyOpts } from '../socket-connector'
import { createConnection } from 'node:net'

export function getSmtpResponseCode(response: string): SMTPResponseCode {
    const responseCode = Number(response.substring(0, 3))

    if (Object.values(SMTPResponseCode).includes(responseCode)) {
        return responseCode as SMTPResponseCode
    }

    throw new SMTPClientError(SMTPClientErrorCode.UnknownErrorCode, 'Unknown code: ' + responseCode)
}

export function isLastLine(line: string): boolean {
    const regex = /^\d{3} /
    return regex.test(line)
}

async function connectThroughHttpProxy(host: string, port: number): Promise<void> {}

async function connectThroughProxy(host: string, port: number, proxy: ProxyOpts): Promise<Socket> {
    if (proxy.type === 'http') {
        return await connectThroughProxy(host, port, proxy)
    }

    throw new Error('Unsupported proxy type')
}

async function connect(host: string, port: number): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
        const errorListener = (err: Error): void => {
            socket.removeListener('error', connectListener)
            reject(err)
        }

        const connectListener = (): void => {
            socket.removeListener('error', errorListener)
            resolve(socket)
        }

        const socket = createConnection(port, host)
        resolve(socket)
    })
}

export async function socketFactory(host: string, port = 25, proxy?: ProxyOpts): Promise<Socket> {
    if (proxy !== undefined) {
        return await connectThroughProxy(host, port, proxy)
    } else {
        return await connect(host, port)
    }
}
