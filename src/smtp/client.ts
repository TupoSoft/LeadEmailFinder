import { SmtpError } from './errors'
import { SMTP_RESPONSE_REGEX } from './constants'
import { SmtpResponseCode } from './enums'
import { ok } from 'node:assert'
import type { Socket } from 'node:net'
import { readUntil, write } from '../stream'
import { parseSmtpResponse } from './util'
import type { SmtpResponse } from './dto'
import type { Logger } from '../logging'

export interface ISMTPClient {
    helo: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>

    isReady: () => Promise<void>
}

export class SMTPClient implements ISMTPClient {
    constructor(
        private readonly socket: Socket,
        private readonly logger: Logger,
    ) {}

    isReady: () => Promise<void> = async () => {
        const { code, enhancedCode, message } = await this.readResponse()

        if (code !== SmtpResponseCode.ServiceReady) {
            throw new SmtpError(code, enhancedCode, message)
        }
    }

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

    private async readResponse(): Promise<SmtpResponse> {
        const response = await readUntil(this.socket, SMTP_RESPONSE_REGEX)
        this.logger.debug(`Response: ${response}`)

        const responseLines = response.split('\r\n')

        responseLines.pop()
        const lastLine = responseLines.pop()

        ok(lastLine !== undefined, `Malformed response: ${response}`)

        const smtpResponse = parseSmtpResponse(lastLine)
        const { code, enhancedCode, message } = smtpResponse

        if (code > SmtpResponseCode.OK) {
            throw new SmtpError(code, enhancedCode, message)
        }

        return smtpResponse
    }

    private async sendCommand(command: string): Promise<void> {
        this.logger.debug(`Sending command: ${command}`)

        await write(this.socket, `${command}\r\n`)
        await this.readResponse()
    }
}
