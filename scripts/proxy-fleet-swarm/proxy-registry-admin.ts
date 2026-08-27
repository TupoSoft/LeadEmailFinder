/**
 * A small port over `/v1/proxies` (see `src/libs/modules/proxy/src/proxy.controller.ts`), scoped to
 * exactly what the reconcile engine needs: list every registry record this reconciler owns, create a
 * new one disabled, update its synchronized fields, and transition its lifecycle state. Deliberately
 * does not import the application's `ProxyDto`/`ProxyProtocol`/`ProxyLifecycle` types, so this tool
 * stays decoupled from the NestJS module graph; the wire shapes below mirror `proxy.dto.ts` and must
 * be kept in step with it by hand.
 */

/** Mirrors `ProxyProtocol.HTTP` in `src/libs/modules/proxy/src/proxy.dto.ts`. */
export const PROXY_PROTOCOL_HTTP = 1

export type ProxyState = 'active' | 'draining' | 'disabled'

/** Every registry record this reconciler manages carries a description starting with this prefix. */
export const OWNED_DESCRIPTION_PREFIX = 'proxy-fleet:'

export function ownedDescriptionFor(egressId: string): string {
    return `${OWNED_DESCRIPTION_PREFIX}${egressId}`
}

export interface ProxyAuth {
    readonly user: string
    readonly pass: string
}

export interface OwnedProxyRecord {
    readonly id: string
    readonly protocol: number
    readonly host: string
    readonly port: number
    readonly state: ProxyState
    readonly weight: number
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
    readonly description: string
}

export interface DesiredProxyRecord {
    readonly egressId: string
    readonly protocol: number
    readonly host: string
    readonly port: number
    readonly auth: ProxyAuth
    readonly weight: number
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
}

export interface ProxyRecordPatch {
    readonly protocol?: number
    readonly host?: string
    readonly port?: number
    readonly auth?: ProxyAuth
    readonly weight?: number
    readonly maxConcurrent?: number
    readonly requestsPerMinute?: number
    readonly description?: string
}

/**
 * Everything the reconcile engine needs from the proxy registry. Keeping HTTP concerns (pagination,
 * authentication, serialization, response errors) inside the adapter is what lets the engine be
 * tested without a live API.
 */
export interface ProxyRegistryAdminPort {
    listOwnedProxies(): Promise<OwnedProxyRecord[]>
    createDisabled(desired: DesiredProxyRecord): Promise<OwnedProxyRecord>
    update(id: string, patch: ProxyRecordPatch): Promise<void>
    transitionState(id: string, state: ProxyState): Promise<void>
}

export interface HttpProxyRegistryAdminOptions {
    readonly baseUrl: string
    readonly getBearerToken: () => Promise<string>
}

interface RawProxy {
    id: string
    protocol: number
    host: string
    port: number
    state: ProxyState
    weight: number
    maxConcurrent: number
    requestsPerMinute: number
    description?: string
}

export class HttpProxyRegistryAdmin implements ProxyRegistryAdminPort {
    constructor(private readonly options: HttpProxyRegistryAdminOptions) {}

    async listOwnedProxies(): Promise<OwnedProxyRecord[]> {
        const owned: OwnedProxyRecord[] = []
        let pageToken: string | undefined

        do {
            const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}&pageSize=100` : '?pageSize=100'
            const page = await this.request<{ proxies: RawProxy[]; nextPageToken: string }>('GET', `/v1/proxies${query}`)

            for (const raw of page.proxies) {
                if (raw.description?.startsWith(OWNED_DESCRIPTION_PREFIX)) {
                    owned.push(toOwnedRecord(raw))
                }
            }

            pageToken = page.nextPageToken || undefined
        } while (pageToken)

        return owned
    }

    async createDisabled(desired: DesiredProxyRecord): Promise<OwnedProxyRecord> {
        const raw = await this.request<RawProxy>('POST', '/v1/proxies', {
            protocol: desired.protocol,
            host: desired.host,
            port: desired.port,
            auth: desired.auth,
            weight: desired.weight,
            maxConcurrent: desired.maxConcurrent,
            requestsPerMinute: desired.requestsPerMinute,
            description: ownedDescriptionFor(desired.egressId),
            state: 'disabled',
        })

        return toOwnedRecord(raw)
    }

    async update(id: string, patch: ProxyRecordPatch): Promise<void> {
        await this.request('PATCH', `/v1/proxies/${id}`, patch)
    }

    async transitionState(id: string, state: ProxyState): Promise<void> {
        await this.request('PATCH', `/v1/proxies/${id}`, { state })
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const token = await this.options.getBearerToken()
        const response = await fetch(`${this.options.baseUrl}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })

        if (!response.ok) {
            throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${await response.text()}`)
        }

        const text = await response.text()
        return (text.length === 0 ? undefined : JSON.parse(text)) as T
    }
}

function toOwnedRecord(raw: RawProxy): OwnedProxyRecord {
    return {
        id: raw.id,
        protocol: raw.protocol,
        host: raw.host,
        port: raw.port,
        state: raw.state,
        weight: raw.weight,
        maxConcurrent: raw.maxConcurrent,
        requestsPerMinute: raw.requestsPerMinute,
        description: raw.description ?? '',
    }
}
