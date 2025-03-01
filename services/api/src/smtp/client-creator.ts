import { type SmtpClient, type SmtpClientConstructorOptions, SmtpClientImpl } from './client'
import type { ExtensibleLogger } from 'logging'

export interface SmtpClientCreator {
    create: (options: SmtpClientConstructorOptions) => SmtpClient
}

export class SmtpClientCreatorImpl implements SmtpClientCreator {
    constructor(private readonly logger: ExtensibleLogger) {}

    create: (options: SmtpClientConstructorOptions) => SmtpClient = options =>
        new SmtpClientImpl({
            logger: this.logger.child({ source: options.proxy?.host, exchange: options.host }),
            ...options,
        })
}
