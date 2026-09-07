import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type TeamMember =
    paths['/v1/organizations/{organizationId}/members']['get']['responses'][200]['content']['application/json'][number]
export type InviteRequest =
    paths['/v1/organizations/{organizationId}/invitations']['post']['requestBody']['content']['application/json']
export type TeamRole = InviteRequest['role']

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

export const teamQueryKey = (organizationId: string) => ['team', organizationId, 'members'] as const

export async function readTeam(api: ApiClient, organizationId: string, signal?: AbortSignal): Promise<TeamMember[]> {
    return requireData(
        await api.GET('/v1/organizations/{organizationId}/members', {
            params: { path: { organizationId } },
            signal,
        }),
    ).map(({ id, email, role, status }) => ({ id, email, role, status }))
}

export async function issueInvitation(
    api: ApiClient,
    organizationId: string,
    body: InviteRequest,
    signal: AbortSignal,
): Promise<string> {
    const { token } = requireData(
        await api.POST('/v1/organizations/{organizationId}/invitations', {
            params: { path: { organizationId } },
            body,
            signal,
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
        }),
    )
    return new URL(`/accept-invitation/${encodeURIComponent(token)}`, window.location.origin).href
}

export async function changeTeamRole(
    api: ApiClient,
    organizationId: string,
    membershipId: string,
    role: TeamRole,
    signal: AbortSignal,
): Promise<void> {
    requireData(
        await api.PATCH('/v1/organizations/{organizationId}/members/{membershipId}', {
            params: { path: { organizationId, membershipId } },
            body: { role },
            signal,
        }),
    )
}

export async function disableTeamMember(
    api: ApiClient,
    organizationId: string,
    membershipId: string,
    signal: AbortSignal,
): Promise<void> {
    const result = await api.DELETE('/v1/organizations/{organizationId}/members/{membershipId}', {
        params: { path: { organizationId, membershipId } },
        signal,
    })
    if (!result.response.ok) throw new ApiError(result.response.status, 'request-failed')
}
