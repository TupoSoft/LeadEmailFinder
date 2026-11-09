export const API_KEY_GENERATOR = Symbol('API_KEY_GENERATOR')

/** Infrastructure generates opaque high-entropy material; use cases disclose it only after commit. */
export type ApiKeyGenerator = () => {
    readonly apiKey: string
    readonly keyHash: string
    readonly keyPrefix: string
}
