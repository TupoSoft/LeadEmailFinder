import type { SocketConnector } from '../socket-connector'
import { PromisifiedSocketClient } from '../socket-client'
import { type SMTPClient, SMTPClientImpl } from './client'
import type { DNSCache } from '../dns'

export interface SMTPClientFactory {
    getInstance: () => SMTPClient
}

export class SMTPClientFactoryImpl implements SMTPClientFactory {
    constructor(
        private readonly socketConnector: SocketConnector,
        private readonly dnsCache: DNSCache,
    ) {}

    getInstance: () => SMTPClient = (): SMTPClient => {
        return new SMTPClientImpl(new PromisifiedSocketClient(this.socketConnector), this.dnsCache)
    }
}
