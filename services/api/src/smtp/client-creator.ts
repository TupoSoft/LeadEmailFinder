import { type SmtpClient, type SmtpClientConstructorOptions, SmtpClientImpl } from './client'
import type { ConnectionLimiter } from './connection-limiter'
import type { ExtensibleLogger } from 'logging'

export interface SmtpClientCreator {
    create: (options: SmtpClientConstructorOptions) => SmtpClient
}

export class SmtpClientCreatorImpl implements SmtpClientCreator {
    constructor(
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly logger: ExtensibleLogger,
    ) {}

    create: (options: SmtpClientConstructorOptions) => SmtpClient = options =>
        new SmtpClientImpl({ logger: this.logger, ...options }, this.connectionLimiter)
}
