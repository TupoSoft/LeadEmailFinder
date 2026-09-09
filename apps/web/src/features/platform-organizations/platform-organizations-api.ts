import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type OrganizationDirectory = paths['/v1/organizations']['get']['responses'][200]['content']['application/json']
export type DirectoryOrganization = OrganizationDirectory['organizations'][number]
export type CreateOrganization = paths['/v1/organizations']['post']['requestBody']['content']['application/json']

export const organizationDirectoryQueryKey = ['platform-organizations', 'directory'] as const
export const organizationReconciliationQueryKey = ['platform-organizations', 'reconciliation'] as const

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

export async function readOrganizations(api: ApiClient, pageToken: string | undefined, signal: AbortSignal) {
    const result = requireData(
        await api.GET('/v1/organizations', {
            params: { query: { pageSize: 50, ...(pageToken === undefined ? {} : { pageToken }) } },
            signal,
        }),
    )
    // Only public directory fields enter server-state caches, even if the response expands later.
    return {
        organizations: result.organizations.map(({ id, name, createdAt, updatedAt }) => ({
            id,
            name,
            createdAt,
            updatedAt,
        })),
        ...(result.nextPageToken === undefined ? {} : { nextPageToken: result.nextPageToken }),
    }
}

export async function createOrganization(api: ApiClient, body: CreateOrganization, signal: AbortSignal) {
    const { invitation } = requireData(
        await api.POST('/v1/organizations', { body, signal, cache: 'no-store', referrerPolicy: 'no-referrer' }),
    )
    if (typeof invitation.token !== 'string' || invitation.token.length === 0) throw new ApiError(502, 'request-failed')
    return new URL(`/accept-invitation/${encodeURIComponent(invitation.token)}`, window.location.origin).href
}
