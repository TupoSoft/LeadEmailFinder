import { IProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { ISmtpClient } from './smtp-client.interface'

export interface SmtpClientFactoryOptions {
    host: string
    proxy?: IProxy
    /** Aborts an in-flight connection or command when a leased execution's generation is lost, so a socket is
     *  never left open past the lease's shutdown bound. */
    signal?: AbortSignal
}

export interface ISmtpClientFactory {
    create(options: SmtpClientFactoryOptions): ISmtpClient
}
