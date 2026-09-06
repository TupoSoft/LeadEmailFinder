import {
    createApiClient,
    type ApiClient,
    type ClientOptions,
} from '@tuposoft/lead-email-finder-api-client'
import { createCsrfMiddleware } from './csrf'

export interface BrowserApiClientOptions {
    fetch?: ClientOptions['fetch']
    readCookies?: () => string
}

export function createBrowserApiClient(options: BrowserApiClientOptions = {}): ApiClient {
    const client = createApiClient({
        baseUrl: '',
        credentials: 'same-origin',
        fetch: options.fetch,
    })
    client.use(createCsrfMiddleware(options.readCookies))
    return client
}
