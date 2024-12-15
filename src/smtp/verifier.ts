import { type DNSCache, getSecondLevelDomain } from '../dns'
import { type ISMTPClient, SMTPClient } from './client'
import { appendRandomPrefix } from '../string-util'
import type { SMTPVerificationResult } from './dto'
import type { CatchAllCache } from '../email-verification'
import { SmtpError } from './errors'
import { ok } from 'node:assert'
import type { Proxy, ProxyService } from '../proxy'
import type { ConnectionLimiter } from './connection-limiter'
import type { Socket } from 'node:net'
import { connect } from '../socket/connect'
import { SMTP_PORT } from './constants'
import { isNativeError } from 'node:util/types'
import type { Logger } from '../logging'

export interface SMTPVerifyOptions {
    email: string
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

interface TryToConnectResult {
    socket: Socket
    exchange: string
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
        private readonly proxyService: ProxyService,
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly logger: Logger,
    ) {}

    private static async getNewCatchAllStatus(client: ISMTPClient, domain: string): Promise<boolean | undefined> {
        try {
            await client.rcptTo(appendRandomPrefix(`danilo@${domain}`))
            return true
        } catch (error) {
            if (error instanceof SmtpError) {
                return false
            } else {
                return undefined
            }
        }
    }

    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult> = async opts => {
        const smtpVerificationResult: SMTPVerificationResult = {}
        const { email } = opts

        const [, domain] = email.split('@')

        try {
            const socket = await this.getSocket(domain)

            const client = new SMTPClient(socket, this.logger)

            await client.isReady()

            ok(socket.remoteAddress !== undefined, new Error('The socket is not connected'))

            const hostnames = await this.dnsCache.resolve(socket.remoteAddress, 'PTR')
            const [clientHostname] = hostnames

            await client.helo(clientHostname)

            const clientDomain = getSecondLevelDomain(clientHostname)

            ok(clientDomain !== undefined, new Error(`Invalid client domain: ${clientDomain}`))

            const senderUsername = 'danilo'
            const senderEmail = `${senderUsername}@${clientDomain}`

            await client.mailFrom(senderEmail)

            smtpVerificationResult.catchAllStatus = await this.getCatchAllStatus(client, domain)

            if (smtpVerificationResult.catchAllStatus === false) {
                smtpVerificationResult.exists = await client.rcptTo(email).then(
                    _ => true,
                    (_: unknown) => false,
                )
            }

            void client.quit()
        } catch (error) {
            ok(isNativeError(error))
            console.error(`Error in SMTPVerifier.verify: `, error)
            throw error
        }

        return smtpVerificationResult
    }

    private async getSocket(domain: string): Promise<Socket> {
        const mxRecords = await this.dnsCache.resolve(domain, 'MX')
        const proxies = await this.proxyService.getAll()

        const connectPromises: Array<Promise<TryToConnectResult>> = []
        const exchangeProxyAbortControllerMap = new Map<string, AbortController>()
        for (const { exchange } of mxRecords) {
            for (const proxy of proxies) {
                const abortController = new AbortController()
                exchangeProxyAbortControllerMap.set(`${exchange}-${proxy.host}`, abortController)
                connectPromises.push(this.tryToConnect(exchange, proxy, abortController.signal))
            }
        }

        try {
            const { socket, exchange } = await Promise.any(connectPromises)

            ok(socket.remoteAddress !== undefined, new Error('The socket is not connected'))
            exchangeProxyAbortControllerMap.delete(`${exchange}-${socket.remoteAddress}`)

            for (const [, abortController] of exchangeProxyAbortControllerMap) {
                abortController.abort()
            }

            void Promise.allSettled(connectPromises)

            return socket
        } catch (error) {
            ok(isNativeError(error))
            console.error(error.message)
            throw error
        }
    }

    private async tryToConnect(exchange: string, proxy: Proxy, signal?: AbortSignal): Promise<TryToConnectResult> {
        const locked = await this.connectionLimiter.acquire(proxy.host, exchange, signal)

        const onClose = (): void => {
            if (locked) {
                void this.connectionLimiter.release(proxy.host, exchange)
            }
        }

        signal?.addEventListener('abort', onClose)

        try {
            const socket = await connect({
                host: exchange,
                port: SMTP_PORT,
                proxy,
                signal,
            })

            socket.once('close', onClose)

            return { socket, exchange }
        } catch (error) {
            ok(isNativeError(error))

            if (error instanceof DOMException) {
                console.error('Aborted')
                onClose()
            }

            throw error
        }
    }

    private async getCatchAllStatus(client: ISMTPClient, domain: string): Promise<boolean | undefined> {
        const existingCatchAllStatus = await this.catchAllCache.getCatchAllStatusForDomain(domain)

        if (existingCatchAllStatus !== undefined) {
            return existingCatchAllStatus
        } else {
            const catchAllStatus = await SMTPVerifier.getNewCatchAllStatus(client, domain)

            if (catchAllStatus !== undefined) {
                await this.catchAllCache.setCatchAllStatusForDomain(domain, catchAllStatus)
            }

            return catchAllStatus
        }
    }
}

export class MockSMTPVerifier implements ISMTPVerifier {
    verify!: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}
