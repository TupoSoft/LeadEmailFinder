export type JsonObject = Record<string, unknown>

export interface IdentifiedRepresentation extends JsonObject {
    id?: string
}

export interface NamedRepresentation extends IdentifiedRepresentation {
    name: string
}

export interface ClientRepresentation extends IdentifiedRepresentation {
    clientId: string
}

export interface AuthenticationFlowRepresentation extends IdentifiedRepresentation {
    alias: string
}

export interface AuthenticationExecutionRepresentation extends IdentifiedRepresentation {
    displayName?: string
    providerId?: string
    requirement?: string
    requirementChoices?: string[]
    authenticationConfig?: string
}

export interface KeycloakAdminApiOptions {
    baseUrl: string
    username: string
    password: string
}

export interface KeycloakAdminPort {
    request<T = void>(method: string, path: string, body?: unknown, acceptedStatuses?: number[]): Promise<T>
    requestOrUndefined<T>(path: string): Promise<T | undefined>
}

export class KeycloakAdminApi {
    private accessToken?: string

    constructor(private readonly options: KeycloakAdminApiOptions) {}

    async authenticate(): Promise<void> {
        const body = new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: this.options.username,
            password: this.options.password,
        })
        const response = await fetch(`${this.options.baseUrl}/realms/master/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body,
        })
        const payload = (await this.readJson(response)) as { access_token?: string }
        if (!response.ok || !payload.access_token) {
            throw new Error(`Keycloak admin authentication failed with HTTP ${response.status}`)
        }
        this.accessToken = payload.access_token
    }

    async request<T = void>(
        method: string,
        path: string,
        body?: unknown,
        acceptedStatuses: number[] = [200, 201, 204],
    ): Promise<T> {
        if (!this.accessToken) {
            throw new Error('Keycloak admin API requires authenticate() before use')
        }
        const response = await fetch(`${this.options.baseUrl}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${this.accessToken}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (!acceptedStatuses.includes(response.status)) {
            const details = await response.text()
            throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${details}`)
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return undefined as T
        }
        return (await this.readJson(response)) as T
    }

    async requestOrUndefined<T>(path: string): Promise<T | undefined> {
        if (!this.accessToken) {
            throw new Error('Keycloak admin API requires authenticate() before use')
        }
        const response = await fetch(`${this.options.baseUrl}${path}`, {
            headers: { authorization: `Bearer ${this.accessToken}` },
        })
        if (response.status === 404) {
            return undefined
        }
        if (!response.ok) {
            throw new Error(`GET ${path} failed with HTTP ${response.status}: ${await response.text()}`)
        }
        return (await this.readJson(response)) as T
    }

    private async readJson(response: Response): Promise<unknown> {
        const text = await response.text()
        return text.length === 0 ? undefined : JSON.parse(text)
    }
}
