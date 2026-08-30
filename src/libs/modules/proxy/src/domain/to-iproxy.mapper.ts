import { ProxyProtocol } from './proxy-protocol'
import { ProxyRecord } from './proxy-record'
import { IProxy } from './proxy.interface'

const PROTOCOL_TO_TYPE: Record<ProxyProtocol, IProxy['type']> = {
    [ProxyProtocol.HTTP]: 'http',
    [ProxyProtocol.HTTPS]: 'https',
    [ProxyProtocol.SOCKS4]: 'socks4',
    [ProxyProtocol.SOCKS5]: 'socks5',
}

export function toIProxy(record: ProxyRecord): IProxy {
    return {
        id: record.id,
        type: PROTOCOL_TO_TYPE[record.protocol],
        host: record.host,
        port: record.port,
        user: record.auth?.user,
        password: record.auth?.pass,
        blacklists: record.blacklists as string[] | undefined,
    }
}
