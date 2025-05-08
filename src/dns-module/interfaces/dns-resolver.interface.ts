import type { DNSTypeMap } from '../util'

export interface DnsResolver {
    resolve: <T extends keyof DNSTypeMap>(name: string, type: T) => Promise<DNSTypeMap[T]>
}
