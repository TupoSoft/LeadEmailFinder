import { Inject, Injectable } from '@nestjs/common'
import { KEYCLOAK_ADMIN_HTTP, KeycloakAdminHttp } from '@tuposoft/lead-email-finder/keycloak-admin-http'
import {
    CreateServiceClientInput,
    KeycloakServiceClientAdmin,
    ProvisionedServiceClient,
} from '../../application/ports/keycloak-service-client-admin'

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
    constructor(@Inject(KEYCLOAK_ADMIN_HTTP) private readonly http: KeycloakAdminHttp) {}

    async provisionClient({ keycloakClientId }: CreateServiceClientInput): Promise<ProvisionedServiceClient> {
        const internalId = await this.ensureClient(keycloakClientId)
        const audienceScope = await this.findAudienceScope()
        await this.assignDefaultScope(internalId, audienceScope.id as string)

        const secret = await this.http.requestRealm<SecretRepresentation>(
            'GET',
            `/clients/${internalId}/client-secret`,
        )
        const serviceAccountUser = await this.http.requestRealm<{ id: string }>(
            'GET',
            `/clients/${internalId}/service-account-user`,
        )

        return { subject: serviceAccountUser.id, secret: secret.value }
    }

    async rotateSecret(keycloakClientId: string): Promise<string> {
        const internalId = await this.findClientInternalId(keycloakClientId)
        if (!internalId) {
            throw new Error(`Keycloak client ${keycloakClientId} was not found`)
        }

        const secret = await this.http.requestRealm<SecretRepresentation>(
            'POST',
            `/clients/${internalId}/client-secret`,
        )

        return secret.value
    }

    async deleteClient(keycloakClientId: string): Promise<void> {
        const internalId = await this.findClientInternalId(keycloakClientId)
        if (!internalId) {
            return
        }

        await this.http.requestRealm('DELETE', `/clients/${internalId}`, undefined, [204, 404])
    }

    private async ensureClient(keycloakClientId: string): Promise<string> {
        const existingId = await this.findClientInternalId(keycloakClientId)
        if (existingId) {
            return existingId
        }

        await this.http.requestRealm(
            'POST',
            '/clients',
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
        const clients = await this.http.requestRealm<KeycloakClientRepresentation[]>(
            'GET',
            `/clients?clientId=${encodeURIComponent(keycloakClientId)}`,
        )

        return clients.find(client => client.clientId === keycloakClientId)?.id
    }

    private async findAudienceScope(): Promise<NamedRepresentation> {
        const scopes = await this.http.requestRealm<NamedRepresentation[]>('GET', '/client-scopes')
        const scope = scopes.find(candidate => candidate.name === AUDIENCE_SCOPE_NAME)
        if (!scope) {
            throw new Error(`Keycloak client scope ${AUDIENCE_SCOPE_NAME} was not found`)
        }

        return scope
    }

    private async assignDefaultScope(clientInternalId: string, scopeId: string): Promise<void> {
        const scopes = await this.http.requestRealm<NamedRepresentation[]>(
            'GET',
            `/clients/${clientInternalId}/default-client-scopes`,
        )
        if (!scopes.some(scope => scope.id === scopeId)) {
            await this.http.requestRealm(
                'PUT',
                `/clients/${clientInternalId}/default-client-scopes/${scopeId}`,
                undefined,
                [204],
            )
        }
    }
}
