import { Inject, Injectable } from '@nestjs/common'
import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import {
    KEYCLOAK_ADMIN_HTTP_CONFIGURATION,
    KeycloakAdminHttpConfiguration,
} from './keycloak-admin-http-configuration'
import { EnsureKeycloakUserInput, KeycloakOrganizationAdmin, KeycloakUserRef } from './keycloak-organization-admin'

interface KeycloakUserRepresentation {
    id: string
    email?: string
}

interface KeycloakRoleRepresentation {
    id: string
    name: string
}

@Injectable()
export class KeycloakOrganizationAdminClient implements KeycloakOrganizationAdmin {
    constructor(
        private readonly http: KeycloakAdminHttpClient,
        @Inject(KEYCLOAK_ADMIN_HTTP_CONFIGURATION) private readonly configuration: KeycloakAdminHttpConfiguration,
    ) {}

    async ensureUser({ email, password }: EnsureKeycloakUserInput): Promise<KeycloakUserRef> {
        const realm = this.configuration.realm

        let [user] = await this.findByEmail(email)

        if (!user) {
            await this.http.request(
                'POST',
                `/admin/realms/${realm}/users`,
                { username: email, email, enabled: true, emailVerified: true, requiredActions: [] },
                [201],
            )
            ;[user] = await this.findByEmail(email)
            if (!user) {
                throw new Error('Keycloak user was not visible after creation')
            }
        }

        await this.http.request(
            'PUT',
            `/admin/realms/${realm}/users/${user.id}/reset-password`,
            { type: 'password', value: password, temporary: false },
            [204],
        )

        return { subject: user.id }
    }

    async assignRealmRole(subject: string, role: 'owner' | 'admin'): Promise<void> {
        const realm = this.configuration.realm
        const roleRepresentation = await this.http.request<KeycloakRoleRepresentation>(
            'GET',
            `/admin/realms/${realm}/roles/${role}`,
        )

        await this.http.request(
            'POST',
            `/admin/realms/${realm}/users/${subject}/role-mappings/realm`,
            [roleRepresentation],
            [204],
        )
    }

    private findByEmail(email: string): Promise<KeycloakUserRepresentation[]> {
        return this.http.request<KeycloakUserRepresentation[]>(
            'GET',
            `/admin/realms/${this.configuration.realm}/users?email=${encodeURIComponent(email)}&exact=true`,
        )
    }
}
