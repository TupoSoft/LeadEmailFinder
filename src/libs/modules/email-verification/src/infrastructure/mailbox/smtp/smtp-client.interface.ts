export interface ISmtpClient {
    readonly exchange: string
    readonly port: number
    readonly hostname: string
    readonly secureTransport: boolean

    connect: () => Promise<void>
    startSession: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>
    end: () => void
}
