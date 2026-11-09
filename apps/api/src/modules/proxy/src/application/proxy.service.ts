import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyRecord } from '../domain/proxy-record'
import { CreateProxyFields, ProxyFieldUpdates, ProxyRepository } from './ports/proxy-repository'
import { ProxyNotFoundError } from './proxy-not-found.error'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100
// Mirrors class-validator's isUUID() (no version argument, i.e. "all"): versions 1-8, variant 8/9/a/b, plus the
// nil UUID. Reimplemented here (rather than importing class-validator) because this application-layer service
// must stay framework-free; the infrastructure adapter uses the real class-validator function for the same check.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^00000000-0000-0000-0000-000000000000$/i
const WRITABLE_PROXY_FIELDS = [
    'protocol',
    'host',
    'port',
    'auth',
    'state',
    'weight',
    'maxConcurrent',
    'requestsPerMinute',
    'description',
] as const

export class ProxyValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProxyValidationError'
    }
}

export interface CreateProxyCommand {
    readonly protocol: ProxyProtocol
    readonly host: string
    readonly port: number
    readonly auth?: { readonly user: string; readonly pass: string }
    readonly description?: string
    readonly weight?: number
    readonly state?: ProxyLifecycle
    readonly maxConcurrent?: number
    readonly requestsPerMinute?: number
}

export interface ListProxiesCommand {
    readonly pageSize?: number
    readonly pageToken?: string
}

export interface ListProxiesResult {
    readonly proxies: readonly ProxyRecord[]
    readonly nextPageToken: string
}

export interface ReportBlacklistCommand {
    readonly mxHost: string
}

export class ProxyService {
    constructor(private readonly repository: ProxyRepository) {}

    async getProxy(id: string): Promise<ProxyRecord> {
        const proxy = await this.repository.findById(id)

        if (proxy === undefined) {
            throw new ProxyNotFoundError(id)
        }

        return proxy
    }

    async createProxy(command: CreateProxyCommand): Promise<ProxyRecord> {
        const fields: CreateProxyFields = {
            ...command,
            state: command.state ?? ProxyLifecycle.DISABLED,
            weight: command.weight ?? 1,
            maxConcurrent: command.maxConcurrent ?? 1,
            requestsPerMinute: command.requestsPerMinute ?? 10,
        }

        return this.repository.create(fields)
    }

    async listProxies({ pageSize, pageToken }: ListProxiesCommand): Promise<ListProxiesResult> {
        const resolvedPageSize = Math.min(Math.max(pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

        if (pageToken !== undefined && !UUID_PATTERN.test(pageToken)) {
            throw new ProxyValidationError('Invalid page token.')
        }

        const proxies = await this.repository.list(resolvedPageSize + 1, pageToken)
        const hasNextPage = proxies.length > resolvedPageSize
        const page = hasNextPage ? proxies.slice(0, resolvedPageSize) : proxies

        return {
            proxies: page,
            nextPageToken: hasNextPage ? page.at(-1)!.id : '',
        }
    }

    async updateProxy(id: string, fields: ProxyFieldUpdates): Promise<ProxyRecord> {
        const updateKeys = Object.keys(fields)

        if (updateKeys.length === 0 || updateKeys.some(field => !isWritableProxyField(field))) {
            throw new ProxyValidationError('updateMask must contain one or more writable proxy fields.')
        }

        const updated = await this.repository.update(id, fields)

        if (updated === undefined) {
            throw new ProxyNotFoundError(id)
        }

        return updated
    }

    async deleteProxy(id: string): Promise<ProxyRecord> {
        const deleted = await this.repository.delete(id)

        if (deleted === undefined) {
            throw new ProxyNotFoundError(id)
        }

        return deleted
    }

    async getHealthyProxy(mxHost: string): Promise<ProxyRecord | undefined> {
        const proxies = await this.repository.findActiveNotBlacklistedFor(mxHost)
        const totalWeight = proxies.reduce((sum, proxy) => sum + Math.max(proxy.weight, 0), 0)

        return selectWeightedProxy(proxies, totalWeight)
    }

    async reportProxyBlacklist(id: string, { mxHost }: ReportBlacklistCommand): Promise<void> {
        const updated = await this.repository.addBlacklist(id, mxHost)

        if (updated === undefined) {
            throw new ProxyNotFoundError(id)
        }
    }
}

function selectWeightedProxy(proxies: ProxyRecord[], totalWeight: number): ProxyRecord | undefined {
    if (proxies.length === 0) {
        return undefined
    }

    if (totalWeight <= 0) {
        return proxies[0]
    }

    let threshold = Math.random() * totalWeight

    for (const proxy of proxies) {
        threshold -= Math.max(proxy.weight, 0)

        if (threshold < 0) {
            return proxy
        }
    }

    return proxies.at(-1)
}

function isWritableProxyField(field: string): boolean {
    return (WRITABLE_PROXY_FIELDS as readonly string[]).includes(field)
}
