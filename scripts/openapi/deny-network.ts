import { Socket, Server } from 'node:net'
import dgram from 'node:dgram'
import dns from 'node:dns'
import dnsPromises from 'node:dns/promises'
import { syncBuiltinESMExports } from 'node:module'

/** Installed only in the disposable export child, before importing the application. */
export function denyNetwork(): void {
    const rejectNetwork = (): never => {
        throw new Error('Network I/O is forbidden during OpenAPI export')
    }
    Socket.prototype.connect = rejectNetwork
    Server.prototype.listen = rejectNetwork
    dgram.createSocket = rejectNetwork
    for (const target of [dns, dnsPromises, dns.Resolver.prototype, dnsPromises.Resolver.prototype]) {
        for (const name of Object.getOwnPropertyNames(target)) {
            if (name.startsWith('resolve') || name.startsWith('lookup') || name === 'reverse') {
                Object.defineProperty(target, name, { value: rejectNetwork, configurable: true, writable: true })
            }
        }
    }
    syncBuiltinESMExports()
}
