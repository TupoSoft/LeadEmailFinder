import { SMTP_RESPONSE_REGEX } from '../smtp/constants'
import type { SMTPResponseCode } from '../smtp/enums'
import { getSmtpResponseCode } from '../smtp/util'
import type { Socket } from 'net'

export class SMTPCommandHandler {
    private buffer = ''

    private currentResponse: string[] = []

    private readonly commandQueue: Array<(response: string) => void> = []

    constructor(private readonly socket: Socket) {
        this.socket.on('data', this.onData.bind(this))
    }

    async getResponseCode(): Promise<SMTPResponseCode> {
        const response = await new Promise<string>(resolve => {
            this.commandQueue.push(resolve)
        })

        return getSmtpResponseCode(response)
    }

    async sendCommand(command: string): Promise<SMTPResponseCode> {
        console.debug(`Write: ${command}`)

        const response = await new Promise<string>((resolve, reject) => {
            this.commandQueue.push(resolve)
            this.socket.write(command + '\r\n', error => {
                if (error != null) {
                    reject(error)
                }
            })
        })

        return getSmtpResponseCode(response)
    }

    private onData(buffer: Buffer): void {
        const data = buffer.toString()
        console.debug(`Data: ${data}`)

        this.buffer += data
        const lines = this.buffer.split('\r\n')
        this.buffer = lines.pop() ?? ''

        for (const line of lines) {
            const isMultiline = /^\d{3}-/.test(line)
            const isSmtp = SMTP_RESPONSE_REGEX.test(line)

            if (isSmtp) {
                this.currentResponse.push(line)
            }

            if (isSmtp && !isMultiline) {
                const callback = this.commandQueue.shift()

                if (callback != null) {
                    const response = this.currentResponse.join('\r\n')
                    this.currentResponse = []
                    callback(response)
                }
            }
        }
    }
}
