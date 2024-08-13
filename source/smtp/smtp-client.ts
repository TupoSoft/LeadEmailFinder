import {PromisifiedSocket} from "../promisifiedSocket"
import {resolvePtr} from 'dns/promises'
import {getDomainFromSubdomain, ipToArpa} from '../dns'
import {SMTPResponseCode} from "./smtp-response-code";
import {SMTPClientError} from "./smtp-client-error";
import {MxRecord} from "node:dns";
import {ProxyData} from "../proxy";

const enum SMTPClientErrorCode {
    SessionInitiationFailed,
    ClientInitiationFailed,
    NoPTR,
}

interface SMTPClientConnectOpts {
    mxRecords: MxRecord[]
    proxy?: ProxyData
}

export class SMTPClient {
    constructor(private readonly socketClient: PromisifiedSocket = new PromisifiedSocket()) {
    }

    async connect(options: SMTPClientConnectOpts): Promise<MxRecord> {
        const {mxRecords, proxy} = options

        for (const mxRecord of mxRecords) {
            try {
                await this.socketClient.connect({
                    host: mxRecord.exchange,
                    port: 25,
                    keepAlive: true,
                    proxy: proxy,
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
    }

    async helo(): Promise<void> {
        const hostname = await this.getClientHostName()
        const code = await this.sendCommand(`HELO ${hostname}`)
        if (code !== SMTPResponseCode.OK) {
            throw new SMTPClientError(SMTPClientErrorCode.ClientInitiationFailed, "HELO command failed.");
        }
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
        if (!addressInfo) {
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
