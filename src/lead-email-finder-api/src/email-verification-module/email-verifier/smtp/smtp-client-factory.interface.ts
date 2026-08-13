import { IProxy } from '@tuposoft/lead-email-finder/common'
import { ISmtpClient } from './smtp-client.interface'

export interface SmtpClientFactoryOptions {
    host: string
    proxy?: IProxy
}

export interface ISmtpClientFactory {
    create(options: SmtpClientFactoryOptions): ISmtpClient
}
