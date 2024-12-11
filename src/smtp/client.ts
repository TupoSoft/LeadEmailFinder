import { promiseWithTimeout } from '../timeout'
import { SMTPClientError, SMTPClientErrorCode } from './errors'
import { GREETING_TIMEOUT, MAIL_FROM_TIMEOUT, QUIT_TIMEOUT, RCPT_TO_TIMEOUT, SMTP_PORT } from './constants'
import { SMTPResponseCode } from './enums'
import type { DNSCache } from '../dns'
import { getDomainFromSubdomain } from '../dns'
import type { ConnectionLimiter } from './connection-limiter'
import type { Proxy } from '../proxy'
import { ok } from 'node:assert'
import { SocketWrapper } from '../socket/socket-wrapper'
import { isEmptyArray } from '../common/type-guards'
import { FIRST_ARRAY_ELEMENT_INDEX } from '../common/constants'

export interface SMTPClientConnectOpts {
    domain: string
    signal?: AbortSignal
}

interface AttemptConnectionOptions {
    exchange: string
    port: number
    proxy?: Proxy
    signal?: AbortSignal
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
    readonly hostname: string | undefined

    private socketWrapper: SocketWrapper | undefined

    constructor(
        private readonly dnsCache: DNSCache,
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly proxy?: Proxy,
    ) {
        this.hostname = proxy != null ? proxy.host : 'localhost'
    }

    connect: (options: SMTPClientConnectOpts) => Promise<string> = async options => {
        const { domain, signal } = options

        try {
            signal?.throwIfAborted()

            const mxRecords = await this.dnsCache.resolve(domain, 'MX')
            const exchanges = mxRecords.map(({ exchange }) => exchange)
            const exchangeAbortControllerMap = new Map<string, AbortController>(
                exchanges.map(exchange => [exchange, new AbortController()]),
            )

            const attemptConnectionPromises: Array<Promise<AttemptConnectionResult>> = []

            for (const [exchange, { signal }] of exchangeAbortControllerMap) {
                attemptConnectionPromises.push(
                    this.attemptConnection({
                        exchange,
                        port: SMTP_PORT,
                        proxy: this.proxy,
                        signal,
                    }),
                )
            }

            const { socketWrapper, exchange: winner } = await Promise.any(attemptConnectionPromises)

            this.socketWrapper = socketWrapper

            exchangeAbortControllerMap.delete(winner)

            for (const [, controller] of exchangeAbortControllerMap) {
                controller.abort()
            }

            return winner
        } catch (error) {
            console.error('Error in SMTPClient.connect', error)
            ok(error instanceof Error)
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
        await promiseWithTimeout(
            this.sendCommand('QUIT'),
            QUIT_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )

        this.socketWrapper?.end()
    }

    private async attemptConnection(options: AttemptConnectionOptions): Promise<AttemptConnectionResult> {
        const { exchange, port, signal, proxy } = options
        const source = proxy != null ? proxy.host : 'localhost'

        try {
            const socketWrapper = new SocketWrapper(this.connectionLimiter, signal)

            await socketWrapper.connect({
                host: exchange,
                port,
                proxy,
            })

            const serviceReadyPromise = socketWrapper.getResponseCode()

            const code = await serviceReadyPromise

            ok(code === SMTPResponseCode.ServiceReady, new Error(`${exchange} is not ready, code: ${code}`))

            return {
                socketWrapper,
                source,
                exchange,
            }
        } catch (error) {
            ok(error instanceof Error)
            console.error('Error in attempt connection: ', error)
            throw error
        }
    }

    private async getClientHostName(): Promise<string> {
        const { hostname } = this

        ok(hostname !== undefined, 'The socket is not connected')

        const rDNS = await this.dnsCache.resolve(hostname, 'PTR')

        if (isEmptyArray(rDNS)) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        return rDNS[FIRST_ARRAY_ELEMENT_INDEX]
    }

    private async sendCommand(command: string): Promise<SMTPResponseCode> {
        ok(this.socketWrapper != null, 'The client is not connected')
        return await this.socketWrapper.sendCommand(command)
    }
}
