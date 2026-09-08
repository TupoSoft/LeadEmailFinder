import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type ServiceClient =
    paths['/v1/organizations/{organizationId}/service-clients']['get']['responses'][200]['content']['application/json'][number]
export type CreateServiceClient =
    paths['/v1/organizations/{organizationId}/service-clients']['post']['requestBody']['content']['application/json']
export type IssuedServiceClient =
    paths['/v1/organizations/{organizationId}/service-clients']['post']['responses'][201]['content']['application/json']

export const serviceClientsQueryKey = (organizationId: string) => ['service-clients', organizationId] as const

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

export async function readServiceClients(api: ApiClient, organizationId: string, signal: AbortSignal) {
    const clients = requireData(
        await api.GET('/v1/organizations/{organizationId}/service-clients', {
            params: { path: { organizationId } },
            signal,
        }),
    )
    // Allow-list metadata before query caching, even if a server accidentally adds a secret field.
    return clients.map(({ id, clientId, description, permissions, status, createdAt, updatedAt }) => ({
        id,
        clientId,
        description,
        permissions,
        status,
        createdAt,
        updatedAt,
    }))
}

export async function createServiceClient(
    api: ApiClient,
    organizationId: string,
    body: CreateServiceClient,
    signal: AbortSignal,
): Promise<IssuedServiceClient> {
    return requireData(
        await api.POST('/v1/organizations/{organizationId}/service-clients', {
            params: { path: { organizationId } },
            body,
            signal,
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
        }),
    )
}

export async function rotateServiceClient(
    api: ApiClient,
    organizationId: string,
    serviceClientId: string,
    signal: AbortSignal,
): Promise<IssuedServiceClient> {
    return requireData(
        await api.POST('/v1/organizations/{organizationId}/service-clients/{serviceClientId}/rotate', {
            params: { path: { organizationId, serviceClientId } },
            signal,
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
        }),
    )
}

export async function disableServiceClient(
    api: ApiClient,
    organizationId: string,
    serviceClientId: string,
    signal: AbortSignal,
): Promise<void> {
    const result = await api.POST('/v1/organizations/{organizationId}/service-clients/{serviceClientId}/disable', {
        params: { path: { organizationId, serviceClientId } },
        signal,
    })
    if (!result.response.ok) throw new ApiError(result.response.status, 'request-failed')
}

export async function deleteServiceClient(
    api: ApiClient,
    organizationId: string,
    serviceClientId: string,
    signal: AbortSignal,
): Promise<void> {
    const result = await api.DELETE('/v1/organizations/{organizationId}/service-clients/{serviceClientId}', {
        params: { path: { organizationId, serviceClientId } },
        signal,
    })
    if (!result.response.ok) throw new ApiError(result.response.status, 'request-failed')
}
