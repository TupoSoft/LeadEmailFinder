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
import { connect, connectThroughProxy } from '../socket/connect-strategies'
import { SMTPCommandHandler } from '../socket/socket-wrapper'

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
    socket: Socket
    smtpCommandHandler: SMTPCommandHandler
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

    private client: Socket | undefined

    private smtpCommandHandler: SMTPCommandHandler | undefined

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

            const { socket, smtpCommandHandler, exchange } = await Promise.any(attemptConnectionPromises)

            if (this.client === undefined) {
                this.client = socket
                this.smtpCommandHandler = smtpCommandHandler
                this.address = proxy != null ? proxy.host : 'localhost'
                this.targetExchange = exchange
            }

            try {
                abortController.abort()
            } catch (error) {}

            const settledAttemptConnectionPromises = await Promise.allSettled(attemptConnectionPromises)

            const fulfilledAttemptConnectionPromises = settledAttemptConnectionPromises
                .filter(value => value.status === 'fulfilled')
                .filter(({ value }) => value.exchange !== exchange)

            await this.closeFulfilledConnections(fulfilledAttemptConnectionPromises)

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

    private async closeFulfilledConnections(
        promiseSettledResults: Array<
            Exclude<
                PromiseSettledResult<AttemptConnectionResult>,
                {
                    status: 'rejected'
                }
            >
        >,
    ): Promise<void> {
        if (promiseSettledResults.length === 0) return

        const closeFulfilledConnectionPromises = promiseSettledResults.map(async settledResult => {
            await this.closeFulfilledConnection(settledResult)
        })

        await Promise.any(closeFulfilledConnectionPromises)
    }

    private async closeFulfilledConnection(
        promiseSettledResult: Exclude<PromiseSettledResult<AttemptConnectionResult>, { status: 'rejected' }>,
    ): Promise<void> {
        const { value: attemptConnectionResult } = promiseSettledResult
        const { socket, exchange, source } = attemptConnectionResult
        await this.connectionLimiter.release(source, exchange)
        socket.end()
    }

    private async attemptConnection(options: AttemptConnectionOptions): Promise<AttemptConnectionResult> {
        const { exchange, port, abortSignal, proxy } = options
        const source = proxy != null ? proxy.host : 'localhost'

        try {
            await this.connectionLimiter.acquire(source, exchange, abortSignal)

            const socket = new Socket()

            if (proxy !== undefined) {
                await connectThroughProxy({
                    socket,
                    host: exchange,
                    port,
                    proxy,
                })
            } else {
                await connect({ socket, host: exchange, port })
            }

            const smtpCommandHandler = new SMTPCommandHandler(socket)
            const serviceReadyPromise = smtpCommandHandler.getResponseCode()

            abortSignal?.throwIfAborted()
            const code = await serviceReadyPromise

            ok(code === SMTPResponseCode.ServiceReady, new Error(`${exchange} is not ready, code: ${code}`))

            return {
                socket,
                smtpCommandHandler,
                source,
                exchange,
            }
        } catch (error) {
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
        ok(this.smtpCommandHandler != null, 'The client is not connected')
        return await this.smtpCommandHandler.sendCommand(command)
    }
}
