import { Inject, Injectable } from '@nestjs/common'
import { KeycloakAdminHttp } from './keycloak-admin-http'
import { KEYCLOAK_ADMIN_HTTP_CONFIGURATION, KeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5_000
const DEFAULT_TOKEN_TTL_SECONDS = 60

@Injectable()
export class FetchKeycloakAdminHttpClient implements KeycloakAdminHttp {
    private accessToken: string | undefined
    private accessTokenExpiresAt = 0

    constructor(
        @Inject(KEYCLOAK_ADMIN_HTTP_CONFIGURATION) private readonly configuration: KeycloakAdminHttpConfiguration,
    ) {}

    async requestRealm<T = void>(
        method: string,
        path: string,
        body?: unknown,
        acceptedStatuses: readonly number[] = [200, 201, 204],
    ): Promise<T> {
        const token = await this.ensureToken()
        const url = `${this.configuration.baseUrl}/admin/realms/${this.configuration.realm}${path}`
        const response = await fetch(url, {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })

        if (!acceptedStatuses.includes(response.status)) {
            throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${await response.text()}`)
        }

        // An explicitly accepted 404 (an idempotent delete race) returns undefined without parsing a body,
        // the same as a 204 or an empty body -- Keycloak may still return text content on a 404.
        if (response.status === 204 || response.status === 404 || response.headers.get('content-length') === '0') {
            return undefined as T
        }

        const text = await response.text()
        return (text.length === 0 ? undefined : JSON.parse(text)) as T
    }

    private async ensureToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.accessTokenExpiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
            return this.accessToken
        }

        const response = await fetch(
            `${this.configuration.baseUrl}/realms/${this.configuration.realm}/protocol/openid-connect/token`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.configuration.clientId,
                    client_secret: this.configuration.clientSecret,
                }),
            },
        )
        const payload = (await response.json()) as { access_token?: string; expires_in?: number }

        if (!response.ok || !payload.access_token) {
            throw new Error(`Keycloak admin service-account authentication failed with HTTP ${response.status}`)
        }

        this.accessToken = payload.access_token
        this.accessTokenExpiresAt = Date.now() + (payload.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000

        return this.accessToken
    }
}
