import createClient, { type Client, type ClientOptions } from 'openapi-fetch'
import type { paths } from './schema.js'

export type * from './schema.js'
export type { ClientOptions, Middleware } from 'openapi-fetch'

export type ApiClient = Client<paths>

export function createApiClient(options: ClientOptions = {}): ApiClient {
    return createClient<paths>(options)
}
