export interface SmtpClientTimeoutConfig {
    greeting?: number
    mail?: number
    rcpt?: number
}

export interface SmtpClient {
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
