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

export interface SMTPVerifyOptions {
    email: string
}

export interface ISMTPVerifier {
    verify: (opts: SMTPVerifyOptions) => Promise<SMTPVerificationResult>
}

export class SMTPVerifier implements ISMTPVerifier {
    constructor(
        private readonly dnsCache: DNSCache,
        private readonly catchAllCache: CatchAllCache,
        private readonly proxyService: ProxyService,
        private readonly connectionLimiter: ConnectionLimiter,
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

            const client = new SMTPClient(socket)

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
        try {
            const mxRecords = await this.dnsCache.resolve(domain, 'MX')
            const proxies = await this.proxyService.getAll()

            for (const { exchange } of mxRecords) {
                const connectPromises: Array<Promise<Socket>> = []
                const proxyHostnameAbortControllerMap = new Map<string, AbortController>()

                for (const proxy of proxies) {
                    const abortController = new AbortController()
                    proxyHostnameAbortControllerMap.set(proxy.host, abortController)
                    connectPromises.push(this.tryToConnect(exchange, proxy))
                }

                try {
                    const socket = await Promise.any(connectPromises)

                    ok(socket.remoteAddress !== undefined, new Error('The socket is not connected'))
                    proxyHostnameAbortControllerMap.delete(socket.remoteAddress)

                    for (const [, abortController] of proxyHostnameAbortControllerMap) {
                        abortController.abort()
                    }

                    return socket
                } catch (error) {
                    ok(isNativeError(error))
                    console.error(error.message)
                }
            }
        } catch (error) {
            ok(isNativeError(error))
            console.error(error.message)
        }

        throw new Error(`Failed to connect to an exchange server for the domain ${domain}`)
    }

    private async tryToConnect(exchange: string, proxy: Proxy, signal?: AbortSignal): Promise<Socket> {
        await this.connectionLimiter.acquire(proxy.host, exchange)

        const socket = await connect({
            host: exchange,
            port: SMTP_PORT,
            proxy,
            signal,
        })

        socket.once('close', () => {
            void this.connectionLimiter.release(proxy.host, exchange)
        })

        return socket
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
