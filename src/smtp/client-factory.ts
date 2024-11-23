import type { SocketConnector } from '../socket-connector'
import { PromisifiedSocket } from '../my-socket'
import { type SMTPClient, SMTPClientImpl } from './client'

export interface SMTPClientFactory {
    getInstance: () => SMTPClient
}

export class SMTPClientFactoryImpl implements SMTPClientFactory {
    constructor(private readonly socketConnector: SocketConnector) {}

    getInstance: () => SMTPClient = (): SMTPClient => {
        return new SMTPClientImpl(new PromisifiedSocket(this.socketConnector))
    }
}
