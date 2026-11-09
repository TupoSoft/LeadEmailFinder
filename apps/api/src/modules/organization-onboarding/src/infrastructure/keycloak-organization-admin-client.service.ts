import { Inject, Injectable } from '@nestjs/common'
import { KEYCLOAK_ADMIN_HTTP, KeycloakAdminHttp } from '@tuposoft/lead-email-finder/keycloak-admin-http'
import { EnsureKeycloakUserInput, KeycloakOrganizationAdmin, KeycloakUserRef } from '../application/ports/keycloak-organization-admin'

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
    constructor(@Inject(KEYCLOAK_ADMIN_HTTP) private readonly http: KeycloakAdminHttp) {}

    async ensureUser({ email, password }: EnsureKeycloakUserInput): Promise<KeycloakUserRef> {
        let [user] = await this.findByEmail(email)

        if (user) {
            return { subject: user.id, created: false }
        }

        await this.http.requestRealm(
            'POST',
            '/users',
            {
                username: email,
                email,
                firstName: 'Invited',
                lastName: 'User',
                enabled: true,
                emailVerified: true,
                requiredActions: [],
                credentials: [{ type: 'password', value: password, temporary: false }],
            },
            [201],
        )
        ;[user] = await this.findByEmail(email)
        if (!user) {
            throw new Error('Keycloak user was not visible after creation')
        }

        return { subject: user.id, created: true }
    }

    async assignRealmRole(subject: string, role: 'owner' | 'admin'): Promise<void> {
        const roleRepresentation = await this.http.requestRealm<KeycloakRoleRepresentation>('GET', `/roles/${role}`)

        await this.http.requestRealm('POST', `/users/${subject}/role-mappings/realm`, [roleRepresentation], [204])
    }

    private findByEmail(email: string): Promise<KeycloakUserRepresentation[]> {
        return this.http.requestRealm<KeycloakUserRepresentation[]>(
            'GET',
            `/users?email=${encodeURIComponent(email)}&exact=true`,
        )
    }
}
