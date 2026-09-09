import { SmtpResponse } from './smtp-response.interface'

export interface ISmtpClient {
    readonly exchange: string
    readonly port: number
    readonly hostname: string
    readonly secureTransport: boolean

    connect: () => Promise<void>
    startSession: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    /** Resolves with the actual response: a resolved promise alone is not proof of 250. */
    rcptTo: (receiverEmail: string) => Promise<SmtpResponse>
    quit: () => Promise<void>
    end: () => void
}
