import { QueryClient } from '@tanstack/react-query'
import { ApiError, StaleAuthResponseError } from '../../api/api-error'

/** Features opt into this only for reads that are safe to repeat. Mutations never retry. */
export function retrySafeRead(failureCount: number, error: Error): boolean {
    if (failureCount >= 1 || error instanceof StaleAuthResponseError || error.name === 'AbortError') return false
    return error instanceof ApiError && [408, 429, 502, 503, 504].includes(error.status)
}

export function createApplicationQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 0,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                refetchInterval: false,
            },
            mutations: { retry: false },
        },
    })
}
