import type { ApiClient } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export async function requestMagicLink(
    api: ApiClient,
    email: string,
    callbackURL: string,
    signal: AbortSignal,
): Promise<void> {
    const result = await api.POST('/v1/auth/sign-in/magic-link', {
        body: { email, callbackURL },
        signal,
    })

    if (!result.data?.status) {
        throw new ApiError(result.response.status, 'request-failed')
    }
}
