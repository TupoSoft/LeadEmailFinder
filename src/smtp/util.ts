import { SMTPResponseCode } from './enums'
import { SMTPClientError, SMTPClientErrorCode } from './errors'
import type { Socket } from 'net'
import { createConnection } from 'node:net'
import { type IncomingMessage, request, type RequestOptions } from 'node:http'
import { SocksClient, type SocksClientOptions } from 'socks'
import { ok } from 'node:assert'

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

interface ProxyOpts {
    type: 'http' | 'socks4' | 'socks5'
    host: string
    port: number
    user?: string
    password?: string
}

function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

async function connectThroughHttpProxy(host: string, port: number, proxy: ProxyOpts): Promise<Socket> {
    const { host: proxyHost, port: proxyPort, user, password } = proxy
    const path = `${host}:${port}`

    return await new Promise<Socket>((resolve, reject) => {
        const requestOptions: RequestOptions = {
            host: proxyHost,
            port: proxyPort,
            method: 'CONNECT',
            path,
            headers: {},
        }

        ok(requestOptions.headers !== undefined, 'The headers object cannot be empty')

        if (user !== undefined && password !== undefined) {
            requestOptions.headers['Proxy-Authorization'] = 'Basic ' + generateAuthTokenFromCredentials(user, password)
        }

        const req = request(requestOptions)

        const connectListener = (res: IncomingMessage, socket: Socket): void => {
            if (res.statusCode !== 200) {
                reject(
                    new Error(
                        `Failed to connect through proxy. Status code: ${res.statusCode}, message: ${res.statusMessage}`,
                    ),
                )
            } else {
                resolve(socket)
            }

            req.removeListener('error', errorListener)
        }

        const errorListener = (err: Error): void => {
            req.removeListener('connect', connectListener)
            reject(new Error(err.message))
        }

        req.once('error', errorListener)
        req.once('connect', connectListener)

        req.end()
    })
}

async function connectThroughSocksProxy(host: string, port: number, proxy: ProxyOpts): Promise<Socket> {
    const { type, host: proxyHost, port: proxyPort, user, password } = proxy

    ok(type.startsWith('socks'), 'Invalid argument')

    const options: SocksClientOptions = {
        proxy: {
            type: type === 'socks5' ? 5 : 4,
            host: proxyHost,
            port: proxyPort,
            userId: user,
            password,
        },

        command: 'connect',

        destination: {
            host,
            port,
        },
    }

    try {
        const { socket } = await SocksClient.createConnection(options)

        return socket
    } catch (error) {
        ok(error instanceof Error)
        throw error
    }
}

async function connectThroughProxy(host: string, port: number, proxy: ProxyOpts): Promise<Socket> {
    if (proxy.type === 'http') {
        return await connectThroughHttpProxy(host, port, proxy)
    } else if (proxy.type === 'socks5' || proxy.type === 'socks4') {
        return await connectThroughSocksProxy(host, port, proxy)
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

export async function createTransport(host: string, port = 25, proxy?: ProxyOpts): Promise<Socket> {
    if (proxy !== undefined) {
        return await connectThroughProxy(host, port, proxy)
    } else {
        return await connect(host, port)
    }
}
