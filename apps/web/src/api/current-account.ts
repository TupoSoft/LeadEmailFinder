import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'

export type CurrentAccount = paths['/v1/auth/session']['get']['responses'][200]['content']['application/json']

export function getCurrentAccount(client: Pick<ApiClient, 'GET'>, signal?: AbortSignal) {
    return client.GET('/v1/auth/session', { signal })
}
