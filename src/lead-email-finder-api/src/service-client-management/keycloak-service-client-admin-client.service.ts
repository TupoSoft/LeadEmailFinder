import { Inject, Injectable } from '@nestjs/common'
import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import {
    KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
    KeycloakAdminHttpConfiguration,
} from './keycloak-admin-http-configuration'
import {
    CreateServiceClientInput,
    KeycloakServiceClientAdmin,
    ProvisionedServiceClient,
} from './keycloak-service-client-admin'

// Matches scripts/keycloak/provisioning.ts's AUDIENCE_SCOPE: the client scope is provisioned once,
// realm-wide, by that script. This adapter only looks it up by name and never recreates it.
const AUDIENCE_SCOPE_NAME = 'lef-api-audience'

interface KeycloakClientRepresentation {
    id?: string
    clientId: string
}

interface NamedRepresentation {
    id?: string
    name?: string
}

interface SecretRepresentation {
    value: string
}

@Injectable()
export class KeycloakServiceClientAdminClient implements KeycloakServiceClientAdmin {
    constructor(
        private readonly http: KeycloakAdminHttpClient,
        @Inject(KEYCLOAK_ADMIN_HTTP_CONFIGURATION) private readonly configuration: KeycloakAdminHttpConfiguration,
    ) {}

    async provisionClient({ keycloakClientId }: CreateServiceClientInput): Promise<ProvisionedServiceClient> {
        const realm = this.configuration.realm

        const internalId = await this.ensureClient(keycloakClientId)
        const audienceScope = await this.findAudienceScope()
        await this.assignDefaultScope(internalId, audienceScope.id as string)

        const secret = await this.http.request<SecretRepresentation>(
            'GET',
            `/admin/realms/${realm}/clients/${internalId}/client-secret`,
        )
        const serviceAccountUser = await this.http.request<{ id: string }>(
            'GET',
            `/admin/realms/${realm}/clients/${internalId}/service-account-user`,
        )

        return { subject: serviceAccountUser.id, secret: secret.value }
    }

    async rotateSecret(keycloakClientId: string): Promise<string> {
        const realm = this.configuration.realm
        const internalId = await this.findClientInternalId(keycloakClientId)
        if (!internalId) {
            throw new Error(`Keycloak client ${keycloakClientId} was not found`)
        }

        const secret = await this.http.request<SecretRepresentation>(
            'POST',
            `/admin/realms/${realm}/clients/${internalId}/client-secret`,
        )

        return secret.value
    }

    async deleteClient(keycloakClientId: string): Promise<void> {
        const realm = this.configuration.realm
        const internalId = await this.findClientInternalId(keycloakClientId)
        if (!internalId) {
            return
        }

        await this.http.request('DELETE', `/admin/realms/${realm}/clients/${internalId}`, undefined, [204, 404])
    }

    private async ensureClient(keycloakClientId: string): Promise<string> {
        const existingId = await this.findClientInternalId(keycloakClientId)
        if (existingId) {
            return existingId
        }

        await this.http.request(
            'POST',
            `/admin/realms/${this.configuration.realm}/clients`,
            {
                clientId: keycloakClientId,
                name: `Lead Email Finder service client ${keycloakClientId}`,
                enabled: true,
                protocol: 'openid-connect',
                publicClient: false,
                standardFlowEnabled: false,
                implicitFlowEnabled: false,
                directAccessGrantsEnabled: false,
                serviceAccountsEnabled: true,
            },
            [201],
        )

        const createdId = await this.findClientInternalId(keycloakClientId)
        if (!createdId) {
            throw new Error('Keycloak client was not visible after creation')
        }

        return createdId
    }

    private async findClientInternalId(keycloakClientId: string): Promise<string | undefined> {
        const clients = await this.http.request<KeycloakClientRepresentation[]>(
            'GET',
            `/admin/realms/${this.configuration.realm}/clients?clientId=${encodeURIComponent(keycloakClientId)}`,
        )

        return clients.find(client => client.clientId === keycloakClientId)?.id
    }

    private async findAudienceScope(): Promise<NamedRepresentation> {
        const scopes = await this.http.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${this.configuration.realm}/client-scopes`,
        )
        const scope = scopes.find(candidate => candidate.name === AUDIENCE_SCOPE_NAME)
        if (!scope) {
            throw new Error(`Keycloak client scope ${AUDIENCE_SCOPE_NAME} was not found`)
        }

        return scope
    }

    private async assignDefaultScope(clientInternalId: string, scopeId: string): Promise<void> {
        const realm = this.configuration.realm
        const scopes = await this.http.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${realm}/clients/${clientInternalId}/default-client-scopes`,
        )
        if (!scopes.some(scope => scope.id === scopeId)) {
            await this.http.request(
                'PUT',
                `/admin/realms/${realm}/clients/${clientInternalId}/default-client-scopes/${scopeId}`,
                undefined,
                [204],
            )
        }
    }
}
