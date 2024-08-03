import {PromisifiedSocket} from "./promisifiedSocket"

import {MxRecord} from 'dns'
import {resolvePtr} from 'dns/promises'
import {getDomainFromSubdomain, ipToArpa} from "./dns";
import {NetworkInterfaceInfo} from "node:os";

export {}

export enum SMTPResponseCode {
    // 2xx: Success
    ServiceReady = 220,
    ServiceClosingTransmissionChannel = 221,
    OK = 250,                // Requested mail action okay, completed.
    MailActionOK = 251,    // User not local; will forward to <forward-path>.

    // 3xx: Positive Completion
    ReadyForMoreInfo = 354, // Start mail input; end with <CRLF>.<CRLF>.

    // 4xx: Temporary Failures
    TemporaryFailure = 421,     // Service not available, closing transmission channel.
    MailboxUnavailable = 450,   // Requested mail action not taken: mailbox unavailable.
    ProcessingAborted = 451,    // Requested action aborted: error in processing.
    InsufficientStorage = 452,   // Requested action not taken: insufficient storage space.

    // 5xx: Permanent Failures
    SyntaxError = 500,          // Syntax error, command unrecognized.
    CommandNotImplemented = 502, // Command not implemented.
    BadSequence = 503,           // Bad sequence of commands.
    NotAuthorized = 530,         // Authentication required.
    MailboxNotFound = 550,      // Requested action not taken: mailbox unavailable.
    UserNotLocal = 551,         // User not local; please try <forward-path>.
    Unavailable = 552,            // Requested mail action aborted: exceeded storage allocation.
    UnknownError = 553,          // Requested action not taken: mailbox name not allowed.
    TransactionFailed = 554,     // Transaction failed.
}

const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    ClientInitiationFailed,
    NoPTR,
}

class SMTPClientError extends Error {
    readonly code: number

    constructor(code: number, message?: string) {
        super(message);
        this.code = code
    }
}

export class SMTPClient {
    private readonly socketClient: PromisifiedSocket;

    constructor() {
        this.socketClient = new PromisifiedSocket();
    }

    async connect(mxRecords: MxRecord[], networkInterfaceInfo: NetworkInterfaceInfo): Promise<MxRecord> {
        for (const mxRecord of mxRecords) {
            try {
                await this.socketClient.connect({
                    host: mxRecord.exchange,
                    port: 25,
                    localAddress: networkInterfaceInfo.address,
                    family: networkInterfaceInfo.family == "IPv4" ? 4 : 6,
                    keepAlive: true,
                })
                const code = await this.readSmtpResponse()
                if (code === SMTPResponseCode.ServiceReady) {
                    return mxRecord;
                }
            } catch (error: unknown) {
                console.error(`Failed to connect to MX record ${mxRecord.exchange} with priority ${mxRecord.priority}: ${error}`)
            }
        }

        throw new SMTPClientError(SMTPClientErrorCode.SessionInitiationFailed, "None of MX records accepted connection.")
    };

    async helo(): Promise<SMTPResponseCode> {
        const hostname = await this.getClientHostName();
        return this.sendCommand(`HELO ${hostname}`);
    }

    async mailFrom(): Promise<SMTPResponseCode> {
        const domain = getDomainFromSubdomain(await this.getClientHostName())
        const email = `john@${domain}`
        return this.sendCommand(`MAIL FROM: <${email}>`)
    }

    rcptTo(email: string): Promise<SMTPResponseCode> {
        return this.sendCommand(`RCPT TO: <${email}>`)
    }

    async quit(): Promise<SMTPResponseCode> {
        const code = await this.sendCommand(`QUIT`)
        this.socketClient.end()
        return code
    }

    isReady(): boolean {
        return this.socketClient.getReadyState() === "open";
    }

    private async sendCommand(command: string): Promise<SMTPResponseCode> {
        await this.socketClient.write(`${command}\r\n`);
        return this.readSmtpResponse();
    }

    private async readSmtpResponse(): Promise<SMTPResponseCode> {
        const response = await this.socketClient.read();
        return this.getSmtpResponseCode(response);
    }

    private getSmtpResponseCode(response: string): SMTPResponseCode {
        const responseCode = Number(response.substring(0, 3))

        if (Object.values(SMTPResponseCode).includes(responseCode)) {
            return responseCode as SMTPResponseCode;
        }

        throw new Error('Unknown error code: ' + responseCode)
    }

    private async getClientHostName(): Promise<string> {
        const addressInfo = this.socketClient.getAddressInfo()
        const addrArpa = ipToArpa(addressInfo)
        const rDNS = await resolvePtr(addrArpa)
        if (rDNS.length < 1) {
            throw new SMTPClientError(SMTPClientErrorCode.NoPTR, "The socket local address doesn't have a PTR!")
        }
        return rDNS[0]
    }
}
