import { resolvePtr } from 'node:dns/promises'
import type { MxRecord } from 'node:dns'
import { getDomainFromSubdomain, ipToArpa } from './dns'
import { promiseWithTimeout } from './timeout'
import { type MySocket, PromisifiedSocket } from './my-socket'
import type { SocketConnector } from './socket-connector'

export enum SMTPResponseCode {
    ServiceReady = 220,
    ServiceClosingTransmissionChannel = 221,
    OK = 250,
    MailActionOK = 251,
    ReadyForMoreInfo = 354,
    TemporaryFailure = 421,
    MailboxUnavailable = 450,
    ProcessingAborted = 451,
    InsufficientStorage = 452,
    SyntaxError = 500,
    CommandNotImplemented = 502,
    BadSequence = 503,
    NotAuthorized = 530,
    MailboxNotFound = 550,
    UserNotLocal = 551,
    Unavailable = 552,
    UnknownError = 553,
    TransactionFailed = 554,
}

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

export const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    ClientInitiationFailed,
    NoPTR,
    UnknownErrorCode,
    OperationTimeoutOut,
    SenderAddressRejected,
    RecipientAddressRejected,
}

export class SMTPClientError extends Error {
    name = 'SMTPClientError'

    constructor(
        readonly code: number,
        message?: string,
    ) {
        super(message)
        this.code = code
    }
}

export class SMTPSessionInitiationFailedError extends SMTPClientError {
    name = 'SMTPSessionInitiationFailedError'

    constructor(readonly mxRecords: MxRecord[]) {
        super(SMTPClientErrorCode.SessionInitiationFailed, 'None of MX records accepted connection.')
    }
}

const SMTP_PORT = 25
// const SESSION_INITIATION_TIMEOUT = 30 * 1000
const GREETING_TIMEOUT = 5 * 60 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.1
const MAIL_FROM_TIMEOUT = 5 * 60 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.2
const RCPT_TO_TIMEOUT = 10 * 1000 // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.3
const QUIT_TIMEOUT = 10 * 1000

export class SMTPClientImpl implements SMTPClient {
    constructor(private readonly socketClient: MySocket) {}

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
        const { mxRecords } = options

        for (const mxRecord of mxRecords) {
            try {
                await this.socketClient.connect({
                    host: mxRecord.exchange,
                    port: SMTP_PORT,
                    keepAlive: true,
                })
                const code = await this.readSmtpResponse()
                if (code === SMTPResponseCode.ServiceReady) {
                    return mxRecord
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    console.error(error.message)
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
                if (SMTPClientImpl.isLastLine(line)) {
                    return SMTPClientImpl.getSmtpResponseCode(line)
                }
            }
        }
    }

    private async getClientHostName(): Promise<string> {
        const addressInfo = this.socketClient.address
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

export interface SMTPClientFactory {
    getInstance: () => SMTPClient
}

export class SMTPClientFactoryImpl implements SMTPClientFactory {
    constructor(private readonly socketConnector: SocketConnector) {}

    getInstance: () => SMTPClient = (): SMTPClient => {
        return new SMTPClientImpl(new PromisifiedSocket(this.socketConnector))
    }
}
