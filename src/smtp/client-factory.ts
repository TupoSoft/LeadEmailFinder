import { type SmtpClient, SmtpClientImpl } from './client'
import type { ConnectionLimiter } from './connection-limiter'
import type { Logger } from '../logging'

export interface SmtpClientFactory {
    getClient: () => SmtpClient
}

export class SmtpClientFactoryImpl implements SmtpClientFactory {
    constructor(
        private readonly connectionLimiter: ConnectionLimiter,
        private readonly logger: Logger,
    ) {}

    getClient: () => SmtpClient = () => new SmtpClientImpl(this.connectionLimiter, this.logger)
}
