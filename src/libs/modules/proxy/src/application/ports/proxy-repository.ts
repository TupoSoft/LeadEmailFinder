import { ProxyLifecycle } from '../../domain/proxy-lifecycle'
import { ProxyProtocol } from '../../domain/proxy-protocol'
import { ProxyRecord } from '../../domain/proxy-record'

export const PROXY_REPOSITORY = Symbol('ProxyRepository')

export interface CreateProxyFields {
    readonly protocol: ProxyProtocol
    readonly host: string
    readonly port: number
    readonly auth?: { readonly user: string; readonly pass: string }
    readonly description?: string
    readonly weight: number
    readonly state: ProxyLifecycle
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
}

export type ProxyFieldUpdates = Partial<CreateProxyFields>

export interface ProxyRepository {
    create(fields: CreateProxyFields): Promise<ProxyRecord>

    findById(id: string): Promise<ProxyRecord | undefined>

    list(take: number, afterId: string | undefined): Promise<ProxyRecord[]>

    update(id: string, fields: ProxyFieldUpdates): Promise<ProxyRecord | undefined>

    delete(id: string): Promise<ProxyRecord | undefined>

    addBlacklist(id: string, mxHost: string): Promise<ProxyRecord | undefined>

    findActiveNotBlacklistedFor(mxHost: string): Promise<ProxyRecord[]>

    findAllActive(): Promise<ProxyRecord[]>

    findActiveExcluding(excludedExchanges: readonly string[]): Promise<ProxyRecord[]>
}
