import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SmtpConfiguration } from '../../email-verification-configuration'
import { SmtpClient } from './smtp-client'
import { ISmtpClientFactory, SmtpClientFactoryOptions } from './smtp-client-factory.interface'
import { ISmtpClient } from './smtp-client.interface'
import { SMTP_PORT } from './smtp.constants'
import { loadSmtpTlsCa } from '../../infrastructure/smtp/smtp-trust'

@Injectable()
export class SmtpClientFactory implements ISmtpClientFactory {
    private readonly port: number
    private readonly ca: string[] | undefined

    constructor(configService: ConfigService<SmtpConfiguration, true>) {
        this.port = configService.get('SMTP_PORT') ?? SMTP_PORT
        this.ca = loadSmtpTlsCa(configService.get('SMTP_TLS_CA_FILE'))
    }

    create(options: SmtpClientFactoryOptions): ISmtpClient {
        return new SmtpClient({ ...options, port: this.port, ca: this.ca })
    }
}
