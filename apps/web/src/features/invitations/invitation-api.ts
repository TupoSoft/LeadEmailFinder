import type { ApiClient, operations } from '@tuposoft/lead-email-finder-api-client'
import { createBrowserApiClient } from '../../api/browser-api-client'

export type InvitationPreview =
    operations['OrganizationsController_previewInvitation']['responses'][200]['content']['application/json']
export type InvitationFailure = 'unknown' | 'expired' | 'consumed' | 'conflict' | 'invalid' | 'unavailable'

export class InvitationRequestError extends Error {
    constructor(readonly reason: InvitationFailure) {
        super('The invitation request could not be completed.')
    }
}

function failure(response: Response, body: unknown): InvitationRequestError {
    if (response.status === 404) return new InvitationRequestError('unknown')
    if (response.status === 409) return new InvitationRequestError('conflict')
    if (response.status === 400) return new InvitationRequestError('invalid')
    if (response.status === 410) {
        let code: unknown
        if (body && typeof body === 'object' && 'code' in body) code = body.code
        return new InvitationRequestError(
            code === 'invitation_expired' ? 'expired' : code === 'invitation_consumed' ? 'consumed' : 'unavailable',
        )
    }
    return new InvitationRequestError('unavailable')
}

export function createInvitationApi(api: ApiClient = createBrowserApiClient({ readCookies: () => '' })) {
    return {
        async preview(this: void, token: string, signal: AbortSignal): Promise<InvitationPreview> {
            const result = await api.GET('/v1/organizations/invitations/{token}', {
                params: { path: { token } },
                signal,
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                credentials: 'omit',
            })
            if (!result.data) throw failure(result.response, result.error)
            const { organizationName, email, role, expiresAt, status } = result.data
            if (
                typeof organizationName !== 'string' ||
                typeof email !== 'string' ||
                !['owner', 'admin', 'member'].includes(role) ||
                status !== 'pending' ||
                typeof expiresAt !== 'string' ||
                !Number.isFinite(Date.parse(expiresAt))
            ) {
                throw new InvitationRequestError('unavailable')
            }
            return { organizationName, email, role, expiresAt, status }
        },
        async accept(this: void, token: string, password: string, signal: AbortSignal): Promise<void> {
            const result = await api.POST('/v1/organizations/invitations/{token}/accept', {
                params: { path: { token } },
                body: { password },
                signal,
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                credentials: 'omit',
            })
            if (!result.response.ok) throw failure(result.response, result.error)
            // Do not retain the first response's PII or return it to a mutation cache.
        },
    }
}

export const invitationApi = createInvitationApi()
export type InvitationApi = typeof invitationApi
