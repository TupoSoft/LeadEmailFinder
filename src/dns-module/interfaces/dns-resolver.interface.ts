import type { DNSTypeMap } from '../util'

export interface DNSResolver {
    resolve: <T extends keyof DNSTypeMap>(name: string, type: T) => Promise<DNSTypeMap[T]>
}
