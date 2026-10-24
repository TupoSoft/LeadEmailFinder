export type ApiKeyValidation = 'valid' | 'rejected' | 'unavailable'
export type ApiKeyValidator = (apiBaseUrl: string, apiKey: string) => Promise<ApiKeyValidation>

/** Every MCP request checks current application state; no token or validation cache. */
export const validateApiKey: ApiKeyValidator = async (apiBaseUrl, apiKey) => {
    try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/v1/auth/api-key`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        })
        await response.body?.cancel()
        if (response.status === 204) return 'valid'
        if (response.status === 401 || response.status === 403) return 'rejected'
        return 'unavailable'
    } catch {
        return 'unavailable'
    }
}
