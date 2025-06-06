import { type SmtpClient, type SmtpClientConstructorOptions } from './client'

export interface SmtpClientCreator {
    create: (options: SmtpClientConstructorOptions) => SmtpClient
}
