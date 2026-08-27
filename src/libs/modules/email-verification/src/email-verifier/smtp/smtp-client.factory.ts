import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SmtpConfiguration } from '../../email-verification-configuration'
import { SmtpClient } from './smtp-client'
import { ISmtpClientFactory, SmtpClientFactoryOptions } from './smtp-client-factory.interface'
import { ISmtpClient } from './smtp-client.interface'
import { SMTP_PORT } from './smtp.constants'

@Injectable()
export class SmtpClientFactory implements ISmtpClientFactory {
    private readonly port: number

    constructor(configService: ConfigService<SmtpConfiguration, true>) {
        this.port = configService.get('SMTP_PORT') ?? SMTP_PORT
    }

    create(options: SmtpClientFactoryOptions): ISmtpClient {
        return new SmtpClient({ ...options, port: this.port })
    }
}
