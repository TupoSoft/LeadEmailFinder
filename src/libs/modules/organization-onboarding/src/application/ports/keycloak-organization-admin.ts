export const KEYCLOAK_ORGANIZATION_ADMIN = Symbol('KEYCLOAK_ORGANIZATION_ADMIN')

export interface EnsureKeycloakUserInput {
    readonly email: string
    readonly password: string
}

export interface KeycloakUserRef {
    readonly subject: string
    readonly created: boolean
}

export interface KeycloakOrganizationAdmin {
    /** Idempotent find-or-create by email; sets the password only when creating a user. */
    ensureUser(input: EnsureKeycloakUserInput): Promise<KeycloakUserRef>

    /** Idempotent add of a realm role named 'owner' or 'admin'; never retracts a previously granted role. */
    assignRealmRole(subject: string, role: 'owner' | 'admin'): Promise<void>
}
