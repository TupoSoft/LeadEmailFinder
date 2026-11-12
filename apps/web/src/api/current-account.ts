import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from './api-error'

export type CurrentAccount = paths['/v1/me']['get']['responses'][200]['content']['application/json']

export async function getCurrentAccount(client: Pick<ApiClient, 'GET'>, signal?: AbortSignal) {
    const result = await client.GET('/v1/me', { signal, cache: 'no-store' })
    if (!result.data) return result

    const { user } = result.data
    if (
        !user ||
        typeof user.id !== 'string' ||
        user.id.length === 0 ||
        typeof user.name !== 'string' ||
        typeof user.email !== 'string' ||
        user.emailVerified !== true ||
        (user.image !== null && typeof user.image !== 'string')
    ) {
        throw new ApiError(502, 'request-failed')
    }

    return {
        ...result,
        data: {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image,
            },
        },
    }
}
