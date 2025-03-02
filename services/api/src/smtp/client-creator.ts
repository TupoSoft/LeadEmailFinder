import { type SmtpClient, type SmtpClientConstructorOptions, SmtpClientImpl } from './client'
import type { ExtensibleLogger } from 'logging'
import type { ConnectionLimiter } from './connection-limiter'
import { randomUUID } from 'node:crypto'

export interface SmtpClientCreator {
    create: (options: SmtpClientConstructorOptions) => SmtpClient
}

export class SmtpClientCreatorImpl implements SmtpClientCreator {
    constructor(
        private readonly logger: ExtensibleLogger,
        private readonly connectionLimiter: ConnectionLimiter,
    ) {}

    create: (options: SmtpClientConstructorOptions) => SmtpClient = options => new SmtpClientImpl(
            {
                logger: this.logger.child({ id: randomUUID(), source: options.proxy?.host, exchange: options.host }),
                ...options,
            },
            this.connectionLimiter,
        )
}
