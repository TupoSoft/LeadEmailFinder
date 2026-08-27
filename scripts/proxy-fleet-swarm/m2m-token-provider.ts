import { readFile } from 'node:fs/promises'

/**
 * The original 2026-08-15 plan text called this an "admin key file." The API's authentication has
 * since moved from static API keys to OIDC (see `.agents/plans/auth/09-remove-api-key-authentication.md`),
 * so the reconciler instead reads an M2M service-client credential file shaped like the ones
 * `scripts/keycloak/provisioning.ts` already produces, and exchanges it for a bearer token itself.
 */
export interface M2mCredentials {
    readonly issuer: string
    readonly clientId: string
    readonly clientSecret: string
}

export async function readM2mCredentialsFile(path: string): Promise<M2mCredentials> {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<M2mCredentials>

    if (typeof raw.issuer !== 'string' || typeof raw.clientId !== 'string' || typeof raw.clientSecret !== 'string') {
        throw new Error(`${path} must contain "issuer", "clientId", and "clientSecret" string fields`)
    }

    return { issuer: raw.issuer, clientId: raw.clientId, clientSecret: raw.clientSecret }
}

export interface BearerTokenProvider {
    getToken(): Promise<string>
}

interface TokenResponse {
    access_token?: string
    expires_in?: number
    error?: string
}

/** Caches the token until shortly before it expires, per the `expires_in` the token endpoint reports. */
export class OidcClientCredentialsTokenProvider implements BearerTokenProvider {
    private cached?: { token: string; expiresAtMs: number }

    constructor(
        private readonly credentials: M2mCredentials,
        private readonly clockSkewSeconds = 30,
        private readonly now: () => number = Date.now,
    ) {}

    async getToken(): Promise<string> {
        const nowMs = this.now()

        if (this.cached && this.cached.expiresAtMs > nowMs) {
            return this.cached.token
        }

        const response = await fetch(`${this.credentials.issuer}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.credentials.clientId,
                client_secret: this.credentials.clientSecret,
            }),
        })
        const payload = (await response.json()) as TokenResponse

        if (!response.ok || !payload.access_token) {
            throw new Error(`Client credentials grant failed with HTTP ${response.status}: ${payload.error ?? 'unknown error'}`)
        }

        const ttlSeconds = payload.expires_in ?? 60
        this.cached = {
            token: payload.access_token,
            expiresAtMs: nowMs + Math.max(ttlSeconds - this.clockSkewSeconds, 1) * 1000,
        }

        return this.cached.token
    }
}
