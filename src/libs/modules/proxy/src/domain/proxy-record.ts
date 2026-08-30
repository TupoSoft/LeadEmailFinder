import { ProxyLifecycle } from './proxy-lifecycle'
import { ProxyProtocol } from './proxy-protocol'

export interface ProxyRecord {
    readonly id: string
    readonly protocol: ProxyProtocol
    readonly host: string
    readonly port: number
    readonly auth?: { readonly user: string; readonly pass: string }
    readonly state: ProxyLifecycle
    readonly weight: number
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
    readonly description?: string
    readonly blacklists?: readonly string[]
    readonly createdAt: Date
    readonly updatedAt: Date
}
