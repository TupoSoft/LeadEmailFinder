import type { ApiClient, components } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type ProxyRecord = components['schemas']['ProxyDto']
export type CreateProxy = components['schemas']['CreateProxyDto']
export type UpdateProxy = components['schemas']['UpdateProxyDto']
export const proxyDirectoryKey = ['platform-proxies', 'directory'] as const
export const proxyDetailKey = (id: string) => ['platform-proxies', 'detail', id] as const

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

/** Explicit public projection also protects caches if an upstream response accidentally expands. */
export function publicProxy({
    id,
    protocol,
    host,
    port,
    state,
    weight,
    maxConcurrent,
    requestsPerMinute,
    description,
    blacklists,
    createdAt,
    updatedAt,
}: ProxyRecord): ProxyRecord {
    return {
        id,
        protocol,
        host,
        port,
        state,
        weight,
        maxConcurrent,
        requestsPerMinute,
        description,
        blacklists: [...blacklists],
        createdAt,
        updatedAt,
    }
}

export async function readProxies(api: ApiClient, pageToken: string | undefined, signal: AbortSignal) {
    const data = requireData(
        await api.GET('/v1/proxies', {
            params: { query: { pageSize: 25, ...(pageToken === undefined ? {} : { pageToken }) } },
            signal,
        }),
    )
    return { proxies: data.proxies.map(publicProxy), nextPageToken: data.nextPageToken }
}

export async function readProxy(api: ApiClient, id: string, signal: AbortSignal) {
    return publicProxy(requireData(await api.GET('/v1/proxies/{id}', { params: { path: { id } }, signal })))
}

export type ProxyOperation =
    | { kind: 'create'; body: CreateProxy }
    | { kind: 'update'; id: string; body: UpdateProxy }
    | { kind: 'delete'; id: string }
    | { kind: 'blacklist'; id: string; mxHost: string }

export function clearProxyCredentials(operation: ProxyOperation | null) {
    if (operation && 'body' in operation && operation.body.auth) {
        operation.body.auth.user = ''
        operation.body.auth.pass = ''
        delete operation.body.auth
    }
}

/** Responses are deliberately discarded; authoritative reads are the only cache input. */
export async function writeProxy(api: ApiClient, operation: ProxyOperation, signal: AbortSignal) {
    const options = { signal, cache: 'no-store' as const, referrerPolicy: 'no-referrer' as const }
    switch (operation.kind) {
        case 'create':
            requireData(await api.POST('/v1/proxies', { ...options, body: operation.body }))
            break
        case 'update':
            requireData(
                await api.PATCH('/v1/proxies/{id}', {
                    ...options,
                    params: { path: { id: operation.id } },
                    body: operation.body,
                }),
            )
            break
        case 'delete':
            await api.DELETE('/v1/proxies/{id}', { ...options, params: { path: { id: operation.id } } })
            break
        case 'blacklist':
            await api.POST('/v1/proxies/{id}/blacklists', {
                ...options,
                params: { path: { id: operation.id } },
                body: { mxHost: operation.mxHost },
            })
    }
}
