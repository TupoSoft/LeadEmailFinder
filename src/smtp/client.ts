import { SmtpError } from './errors'
import { SMTP_RESPONSE_REGEX } from './constants'
import { SmtpResponseCode } from './enums'
import { ok } from 'node:assert'
import type { Socket } from 'node:net'
import { readUntil, write } from '../stream'
import { parseSmtpResponse } from './util'

export interface ISMTPClient {
    helo: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>
}

export class SMTPClient implements ISMTPClient {
    constructor(private readonly socket: Socket) {}

    async helo(hostname: string): Promise<void> {
        await this.sendCommand(`HELO ${hostname}`)
    }

    async mailFrom(senderEmail: string): Promise<void> {
        await this.sendCommand(`MAIL FROM: <${senderEmail}>`)
    }

    async rcptTo(receiverEmail: string): Promise<void> {
        await this.sendCommand(`RCPT TO: <${receiverEmail}>`)
    }

    async quit(): Promise<void> {
        await this.sendCommand('QUIT')

        this.socket.end()
    }

    private async sendCommand(command: string): Promise<void> {
        await write(this.socket, `${command}\r\n`)
        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX)
        const responseLines = response.split('\r\n')
        const lastLine = responseLines.pop()

        ok(lastLine !== undefined, `Malformed response: ${response}`)

        const { code, enhancedCode, message } = parseSmtpResponse(lastLine)

        if (code > SmtpResponseCode.OK) {
            throw new SmtpError(code, enhancedCode, message)
        }
    }
}
