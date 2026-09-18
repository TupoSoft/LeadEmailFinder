export interface ClientCredentials {
    readonly clientId: string
    readonly clientSecret: string
}

export interface AccessTokenProvider {
    getAccessToken(credentials: ClientCredentials): Promise<string>
}

interface TokenResponse {
    access_token?: string
    expires_in?: number
    error?: string
}

/** Carries only the token endpoint's own status and error code -- never the secret that was sent. */
export class ClientCredentialsGrantError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Client credentials grant failed with HTTP ${status}: ${code}`)
    }
}

/** Generalizes `scripts/proxy-fleet-swarm/m2m-token-provider.ts`'s single-credential provider into a
 * cache keyed by `clientId`, so one connector process can serve many customers' own credentials. Only
 * the minted token and its expiry are ever cached -- never the client secret. */
export class TokenCache implements AccessTokenProvider {
    private readonly cache = new Map<string, { token: string; expiresAtMs: number }>()

    constructor(
        private readonly tokenEndpointBaseUrl: string,
        private readonly clockSkewSeconds = 30,
        private readonly now: () => number = Date.now,
    ) {}

    async getAccessToken(credentials: ClientCredentials): Promise<string> {
        const nowMs = this.now()
        const cached = this.cache.get(credentials.clientId)
        if (cached && cached.expiresAtMs > nowMs) return cached.token

        const response = await fetch(`${this.tokenEndpointBaseUrl}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
            }),
        })
        const payload = (await response.json()) as TokenResponse

        if (!response.ok || !payload.access_token) {
            throw new ClientCredentialsGrantError(response.status, payload.error ?? 'unknown_error')
        }

        const ttlSeconds = payload.expires_in ?? 60
        const entry = { token: payload.access_token, expiresAtMs: nowMs + Math.max(ttlSeconds - this.clockSkewSeconds, 1) * 1000 }
        this.cache.set(credentials.clientId, entry)
        return entry.token
    }
}
