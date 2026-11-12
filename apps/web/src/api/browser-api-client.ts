import { createApiClient, type ApiClient, type ClientOptions } from '@tuposoft/lead-email-finder-api-client'

export interface BrowserApiClientOptions {
    fetch?: ClientOptions['fetch']
    authenticationBoundary?: () => { signal: AbortSignal; assertCurrent: (error?: unknown) => void }
}

export function createBrowserApiClient(options: BrowserApiClientOptions = {}): ApiClient {
    const client = createApiClient({
        baseUrl: '',
        credentials: 'same-origin',
        fetch: options.fetch,
    })
    if (!options.authenticationBoundary) return client
    const captureBoundary = options.authenticationBoundary
    const methods = new Set(['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH', 'TRACE'])
    // Keep generated operations and parsing intact. Fence their final promises as well as middleware responses.
    return new Proxy(client, {
        get(target, property, receiver): unknown {
            const operation: unknown = Reflect.get(target, property, receiver)
            if (
                typeof property !== 'string' ||
                (!methods.has(property) && property !== 'request') ||
                typeof operation !== 'function'
            )
                return operation
            return async (...arguments_: unknown[]) => {
                const boundary = captureBoundary()
                const initIndex = property === 'request' ? 2 : 1
                const init = arguments_[initIndex] as RequestInit | undefined
                const signal = init?.signal ? AbortSignal.any([init.signal, boundary.signal]) : boundary.signal
                try {
                    const nextArguments = [...arguments_]
                    nextArguments[initIndex] = { ...init, signal }
                    const result: unknown = await Reflect.apply(operation, target, nextArguments)
                    boundary.assertCurrent()
                    return result
                } catch (error) {
                    boundary.assertCurrent(error)
                    throw error
                }
            }
        },
    })
}
