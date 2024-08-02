import {SocketClient} from "./SocketClient"
import {SMTPResponseCode} from "./SMTPResponseCode";

import {Address6} from "ip-address";
import {AddressInfo} from "node:net";
import dns from 'dns/promises'

export class SMTPClient {
    private socketClient: SocketClient;

    constructor() {
        this.socketClient = new SocketClient();
    }

    async connect(host: string): Promise<SMTPResponseCode> {
        await this.socketClient.connect(host, 25);
        const addressInfo = this.socketClient.getAddressInfo()
        console.debug(`The client local address is: `, addressInfo)
        return this.readSmtpResponse()
    }

    async helo(): Promise<SMTPResponseCode> {
        const hostname = await this.getClientHostName()
        return this.sendCommand(`HELO ${hostname}`)
    }

    async mailFrom(): Promise<SMTPResponseCode> {
        const domain = this.getDomainFromSubdomain(await this.getClientHostName())
        const email = `john@${domain}`
        return this.sendCommand(`MAIL FROM: <${email}>`)
    }

    rcptTo(email: string): Promise<SMTPResponseCode> {
        return this.sendCommand(`RCPT TO: <${email}>`)
    }

    async quit(): Promise<SMTPResponseCode> {
        const code = await this.sendCommand(`QUIT`)
        this.socketClient.disconnect()
        return code
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
        const addrArpa = this.ipToArpa(addressInfo)
        const rDNS = await dns.resolvePtr(addrArpa)
        if (rDNS.length < 1) {
            throw new Error("The socket local address doesn't have a PTR!")
        }
        return rDNS[0]
    }

    private getDomainFromSubdomain(subdomain: string): string {
        return subdomain.split('.').slice(-2).join('.')
    }

    private ipToArpa(address: AddressInfo): string {
        return address.family === 'IPv4' ? this.ipv4ToArpa(address.address) : this.ipv6ToArpa(address.address)
    }

    private ipv4ToArpa(ipv4: string): string {
        return `${ipv4.split('.').reverse().join('.')}.in-addr.arpa`
    }

    private ipv6ToArpa(ipv6: string): string {
        // Create an Address6 object
        const addr = new Address6(ipv6);

        // Get the fully expanded address without colons
        const fullHex = addr.canonicalForm().replace(/:/g, '');

        // Reverse the order of the digits
        const reversedDigits = fullHex.split('').reverse().join('');

        // Insert dots between each digit
        const dottedDigits = reversedDigits.split('').join('.');

        // Append the domain
        return `${dottedDigits}.ip6.arpa`;
    }
}