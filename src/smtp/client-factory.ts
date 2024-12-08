// export interface SMTPClientFactory {
//     getInstance: () => ISMTPClient
// }
//
// export class SMTPClientFactoryImpl implements SMTPClientFactory {
//     constructor(
//         private readonly socketConnector: SocketConnector,
//         private readonly dnsCache: DNSCache,
//     ) {}
//
//     getInstance: () => ISMTPClient = (): ISMTPClient =>
//         new SMTPClient(new PromisifiedSocketClient(this.socketConnector), this.dnsCache)
// }
