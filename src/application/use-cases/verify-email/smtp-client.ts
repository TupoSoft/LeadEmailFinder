import { resolvePtr } from 'node:dns/promises'
import { SMTPResponseCode } from './smtp-response-code'
import { SMTPClientError } from './smtp-client-error'
import type { MxRecord } from 'node:dns'
import { PromisifiedSocket, type ProxyData } from './promisified-socket'
import { getDomainFromSubdomain, ipToArpa } from './dns'
import { promiseWithTimeout } from './timeout'

const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    SessionInitiationRejected,
    ClientInitiationFailed,
    NoPTR,
    UnknownErrorCode,
    OperationTimeoutOut,
}

interface SMTPClientConnectOpts {
    mxRecords: MxRecord[]
    proxy?: ProxyData
}

const SMTP_PORT = 25
// const SESSION_INITIATION_TIMEOUT = 30 * 1000
const GREETING_TIMEOUT = 5 * 60 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.1
const MAIL_FROM_TIMEOUT = 5 * 60 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.2
const RCPT_TO_TIMEOUT = 10 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.3
const QUIT_TIMEOUT = 10 * 1000

export class SMTPClient {
    constructor(private readonly socketClient: PromisifiedSocket = new PromisifiedSocket()) {}

    private static getSmtpResponseCode(response: string): SMTPResponseCode {
        const responseCode = Number(response.substring(0, 3))

        if (Object.values(SMTPResponseCode).includes(responseCode)) {
            return responseCode as SMTPResponseCode
        }

        throw new SMTPClientError(SMTPClientErrorCode.UnknownErrorCode, 'Unknown error code: ' + responseCode)
    }

    private static isLastLine(line: string): boolean {
        const regex = /^\d{3} /
        return regex.test(line)
    }

    async connect(options: SMTPClientConnectOpts): Promise<MxRecord> {
        const { mxRecords, proxy } = options

        for (const mxRecord of mxRecords) {
            try {
                await this.socketClient.connect({
                    host: mxRecord.exchange,
                    port: SMTP_PORT,
                    keepAlive: true,
                    proxy,
                })
                const code = await this.readSmtpResponse()
                if (code === SMTPResponseCode.ServiceReady) {
                    return mxRecord
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    console.error(
                        `Failed to connect to MX record ${mxRecord.exchange} with priority ${mxRecord.priority}: ${error.message}`,
                    )
                }
            }
        }

        throw new SMTPClientError(
            SMTPClientErrorCode.SessionInitiationFailed,
            'None of MX records accepted connection.',
        )
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

    async mailFrom(): Promise<SMTPResponseCode> {
        const domain = getDomainFromSubdomain(await this.getClientHostName())
        const email = `john@${domain}`
        return await promiseWithTimeout(
            this.sendCommand(`MAIL FROM: <${email}>`),
            MAIL_FROM_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )
    }

    async rcptTo(email: string): Promise<SMTPResponseCode> {
        return await promiseWithTimeout(
            this.sendCommand(`RCPT TO: <${email}>`),
            RCPT_TO_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )
    }

    async quit(): Promise<SMTPResponseCode> {
        const code = await promiseWithTimeout(
            this.sendCommand('QUIT'),
            QUIT_TIMEOUT,
            new SMTPClientError(SMTPClientErrorCode.OperationTimeoutOut),
        )
        this.socketClient.end()
        return code
    }

    isReady(): boolean {
        return this.socketClient.getReadyState() === 'open'
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
                if (SMTPClient.isLastLine(line)) {
                    return SMTPClient.getSmtpResponseCode(line)
                }
            }
        }
    }

    private async getClientHostName(): Promise<string> {
        const addressInfo = this.socketClient.getAddressInfo()
        if (addressInfo == null) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        const addrArpa = ipToArpa(addressInfo)
        const rDNS = await resolvePtr(addrArpa)

        if (rDNS.length < 1) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }

        return rDNS[0]
    }
}
