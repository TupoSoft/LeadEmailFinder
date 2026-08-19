export const KEYCLOAK_SERVICE_CLIENT_ADMIN = Symbol('KEYCLOAK_SERVICE_CLIENT_ADMIN')

export interface CreateServiceClientInput {
    readonly keycloakClientId: string
    readonly description: string | null
}

export interface ProvisionedServiceClient {
    readonly subject: string
    readonly secret: string
}

export interface KeycloakServiceClientAdmin {
    /** Idempotent find-or-create by clientId; assigns the audience scope; returns the current secret and service-account subject. */
    provisionClient(input: CreateServiceClientInput): Promise<ProvisionedServiceClient>

    /** Regenerates and returns a brand-new secret for an existing client. */
    rotateSecret(keycloakClientId: string): Promise<string>

    /** Deletes the client; a 404 (already gone) is treated as success. */
    deleteClient(keycloakClientId: string): Promise<void>
}
