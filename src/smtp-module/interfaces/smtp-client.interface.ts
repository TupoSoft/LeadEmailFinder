export interface ISmtpClient {
    exchange: string
    port: number
    hostname: string

    connect: () => Promise<void>
    helo: (hostname: string) => Promise<void>
    mailFrom: (senderEmail: string) => Promise<void>
    rcptTo: (receiverEmail: string) => Promise<void>
    quit: () => Promise<void>
    end: () => void
}
