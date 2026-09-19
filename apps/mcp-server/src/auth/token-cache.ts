import { createHmac, randomBytes } from 'node:crypto'

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
 * cache serving many customers' own credentials. Entries are identified by an HMAC-SHA-256 digest over
 * the complete `(clientId, clientSecret)` pair -- never by `clientId` alone -- so a cached token can
 * never be reused by a request presenting an incorrect or empty secret for a client ID that has
 * previously authenticated successfully. The HMAC key is generated once per process and is never
 * derived from, or reversible to, the credentials it hashes. Only the minted token and its expiry are
 * ever cached; the raw secret itself is never stored. */
export class TokenCache implements AccessTokenProvider {
    private readonly cache = new Map<string, { token: string; expiresAtMs: number }>()
    private readonly pending = new Map<string, Promise<string>>()
    private readonly hmacKey = randomBytes(32)

    constructor(
        private readonly tokenEndpointBaseUrl: string,
        private readonly clockSkewSeconds = 30,
        private readonly now: () => number = Date.now,
    ) {}

    async getAccessToken(credentials: ClientCredentials): Promise<string> {
        const digest = this.digestCredentials(credentials)
        const nowMs = this.now()

        const cached = this.cache.get(digest)
        if (cached) {
            if (cached.expiresAtMs > nowMs) return cached.token
            this.cache.delete(digest)
        }

        const existingGrant = this.pending.get(digest)
        if (existingGrant) return existingGrant

        const grant = this.requestGrant(credentials, digest, nowMs).finally(() => {
            this.pending.delete(digest)
        })
        this.pending.set(digest, grant)
        return grant
    }

    /** The tuple is JSON-encoded (not concatenated) so that, for example, `clientId: 'ab', secret: 'c'`
     * and `clientId: 'a', secret: 'bc'` -- equal under plain concatenation -- digest differently. */
    private digestCredentials(credentials: ClientCredentials): string {
        return createHmac('sha256', this.hmacKey)
            .update(JSON.stringify([credentials.clientId, credentials.clientSecret]))
            .digest('hex')
    }

    private async requestGrant(credentials: ClientCredentials, digest: string, nowMs: number): Promise<string> {
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
        this.cache.set(digest, entry)
        return entry.token
    }
}
