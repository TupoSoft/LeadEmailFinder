import type { MxRecord } from 'node:dns'
import { promiseWithTimeout } from '../timeout'
import type { MySocket } from '../my-socket'
import { SMTPClientError, SMTPClientErrorCode, SMTPSessionInitiationFailedError } from './errors'
import {
    GREETING_TIMEOUT,
    MAIL_FROM_TIMEOUT,
    QUIT_TIMEOUT,
    RCPT_TO_TIMEOUT,
    SESSION_INITIATION_TIMEOUT,
    SMTP_PORT,
} from './constants'
import { SMTPResponseCode } from './enums'
import { getSmtpResponseCode, isLastLine } from './util'
import type { DNSCache } from '../dns'
import { getDomainFromSubdomain } from '../dns'

export interface SMTPClientConnectOpts {
    mxRecords: MxRecord[]
}

export interface SMTPClient {
    connect: (options: SMTPClientConnectOpts) => Promise<MxRecord>
    helo: () => Promise<void>
    mailFrom: () => Promise<void>
    rcptTo: (email: string) => Promise<void>
    quit: () => Promise<void>
}

export class SMTPClientImpl implements SMTPClient {
    constructor(
        private readonly socketClient: MySocket,
        private readonly dnsCache: DNSCache,
    ) {}

    async connect(options: SMTPClientConnectOpts): Promise<MxRecord> {
        const { mxRecords } = options

        for (const mxRecord of mxRecords) {
            try {
                await this.socketClient.connect({
                    host: mxRecord.exchange,
                    port: SMTP_PORT,
                    keepAlive: true,
                })

                const code = await promiseWithTimeout(
                    this.readSmtpResponse(),
                    SESSION_INITIATION_TIMEOUT,
                    new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
                )

                if (code === SMTPResponseCode.ServiceReady) {
                    return mxRecord
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    console.error(error)
                }
            }
        }

        throw new SMTPSessionInitiationFailedError(mxRecords)
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

        await this.socketClient.end()
    }

    private async sendCommand(command: string): Promise<SMTPResponseCode> {
        await this.socketClient.write(`${command}\r\n`)
        return await this.readSmtpResponse()
    }

    private async readSmtpResponse(): Promise<SMTPResponseCode> {
        while (true) {
            const response = await this.socketClient.read()
            const lines = response.split('\r\n')

            for (const currentLine of lines) {
                const line = currentLine
                if (isLastLine(line)) {
                    return getSmtpResponseCode(line)
                }
            }
        }
    }

    private async getClientHostName(): Promise<string> {
        const addressInfo = this.socketClient.address
        if (addressInfo == null) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        const rDNS = await this.dnsCache.resolve(addressInfo.address, 'PTR')

        if (rDNS.length < 1) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        return rDNS[0]
    }
}
