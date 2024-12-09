import { promiseWithTimeout } from '../timeout'
import { SMTPClientError, SMTPClientErrorCode } from './errors'
import { GREETING_TIMEOUT, MAIL_FROM_TIMEOUT, QUIT_TIMEOUT, RCPT_TO_TIMEOUT, SMTP_PORT } from './constants'
import { SMTPResponseCode } from './enums'
import type { DNSCache } from '../dns'
import { getDomainFromSubdomain } from '../dns'
import type { ConnectionLimiter } from './connection-limiter'
import type { Proxy } from '../proxy'
import { ok } from 'node:assert'
import { Socket } from 'net'
import { SocketWrapper } from '../socket/socket-wrapper'

export interface SMTPClientConnectOpts {
    domain: string
    proxy?: Proxy
    abortSignal?: AbortSignal
}

interface AttemptConnectionOptions {
    exchange: string
    port: number
    proxy?: Proxy
    abortSignal?: AbortSignal
}

interface AttemptConnectionResult {
    socketWrapper: SocketWrapper
    source: string
    exchange: string
}

export interface ISMTPClient {
    connect: (options: SMTPClientConnectOpts) => Promise<string>
    helo: () => Promise<void>
    mailFrom: () => Promise<void>
    rcptTo: (email: string) => Promise<void>
    quit: () => Promise<void>
}

export class SMTPClient implements ISMTPClient {
    private address: string | undefined

    private targetExchange: string | undefined

    private readonly client: Socket | undefined

    private socketWrapper: SocketWrapper | undefined

    constructor(
        private readonly dnsCache: DNSCache,
        private readonly connectionLimiter: ConnectionLimiter,
    ) {}

    connect: (options: SMTPClientConnectOpts) => Promise<string> = async options => {
        const { domain, proxy, abortSignal } = options

        try {
            if (abortSignal != null) {
                abortSignal.onabort = () => {
                    abortController.abort()
                }
            }

            const mxRecords = await this.dnsCache.resolve(domain, 'MX')
            const abortController = new AbortController()

            const attemptConnectionPromises = mxRecords.map(
                async ({ exchange }) =>
                    await this.attemptConnection({
                        exchange,
                        port: SMTP_PORT,
                        proxy,
                        abortSignal: abortController.signal,
                    }),
            )

            const { socketWrapper, exchange } = await Promise.any(attemptConnectionPromises)

            if (this.client === undefined) {
                this.socketWrapper = socketWrapper
                this.address = proxy != null ? proxy.host : 'localhost'
                this.targetExchange = exchange
            }

            try {
                abortController.abort()
            } catch (error) {}

            return exchange
        } catch (error) {
            ok(error instanceof Error)
            console.error(error.message)
            throw error
        }
    }

    async helo(): Promise<void> {
        const hostname = await this.getClientHostName()
        const code = await promiseWithTimeout(
            this.sendCommand(`HELO ${hostname}`),
            GREETING_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )

        if (code !== SMTPResponseCode.OK) {
            throw new SMTPClientError(SMTPClientErrorCode.ClientInitiationFailed, 'HELO command failed.')
        }
    }

    async mailFrom(): Promise<void> {
        const domain = getDomainFromSubdomain(await this.getClientHostName())
        const email = `john@${domain}`
        const code = await promiseWithTimeout(
            this.sendCommand(`MAIL FROM: <${email}>`),
            MAIL_FROM_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )

        if (code !== SMTPResponseCode.OK) {
            throw new SMTPClientError(SMTPClientErrorCode.SenderAddressRejected, 'MAIL FROM failed.')
        }
    }

    async rcptTo(email: string): Promise<void> {
        const code = await promiseWithTimeout(
            this.sendCommand(`RCPT TO: <${email}>`),
            RCPT_TO_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )

        if (code !== SMTPResponseCode.OK) {
            throw new SMTPClientError(SMTPClientErrorCode.RecipientAddressRejected, 'RCPT TO failed.')
        }
    }

    async quit(): Promise<void> {
        ok(this.address != null)
        ok(this.targetExchange != null)

        await this.connectionLimiter.release(this.address, this.targetExchange)

        await promiseWithTimeout(
            this.sendCommand('QUIT'),
            QUIT_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )

        this.client?.end()
    }

    private async attemptConnection(options: AttemptConnectionOptions): Promise<AttemptConnectionResult> {
        const { exchange, port, abortSignal, proxy } = options
        const source = proxy != null ? proxy.host : 'localhost'

        const socket = new Socket()
        const socketWrapper = new SocketWrapper(socket)

        try {
            await this.connectionLimiter.acquire(source, exchange, abortSignal)

            abortSignal?.throwIfAborted()
            await socketWrapper.connect({
                host: exchange,
                port,
                proxy,
            })

            const serviceReadyPromise = socketWrapper.getResponseCode()

            abortSignal?.throwIfAborted()
            const code = await serviceReadyPromise

            ok(code === SMTPResponseCode.ServiceReady, new Error(`${exchange} is not ready, code: ${code}`))

            return {
                socketWrapper,
                source,
                exchange,
            }
        } catch (error) {
            socketWrapper.end()
            await this.connectionLimiter.release(source, exchange)

            ok(error instanceof Error)
            console.error(error.message)
            throw error
        }
    }

    private async getClientHostName(): Promise<string> {
        const { address } = this

        ok(address !== undefined, 'The socket is not connected')

        const rDNS = await this.dnsCache.resolve(address, 'PTR')

        if (rDNS.length < 1) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        return rDNS[0]
    }

    private async sendCommand(command: string): Promise<SMTPResponseCode> {
        ok(this.socketWrapper != null, 'The client is not connected')
        return await this.socketWrapper.sendCommand(command)
    }
}
