import type { SmtpClient } from './client'
import type { ConnectionLimiter } from './connection-limiter'
import type { Logger } from '../logging'
import { type SmtpClientConstructorOptions, SmtpClientImpl } from './client-impl'

export interface SmtpClientCreator {
    create: (options: SmtpClientConstructorOptions) => SmtpClient
}

export class SmtpClientCreatorImpl implements SmtpClientCreator {
    constructor(
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly logger: Logger,
    ) {}

    create: (options: SmtpClientConstructorOptions) => SmtpClient = options =>
        new SmtpClientImpl({ logger: this.logger, ...options }, this.connectionLimiter)
}
