import { DataSource } from 'typeorm'
import { ensurePlatformOrganization } from './bootstrap-service-credential'
import { KeycloakAdminPort } from './keycloak-admin-api'
import { REALM } from './provisioning'

export const PLATFORM_OPERATOR_EMAIL = 'platform-operator@lef.test'
// Fixed, checked-in dev-only secret, same convention as BFF_CLIENT_DEV_SECRET/ORG_ADMIN_CLIENT_DEV_SECRET
// in provisioning.ts: this identity must be a stable, memorable local login every reset produces, not a
// one-off random value a developer has to dig out of a JSON file.
export const PLATFORM_OPERATOR_PASSWORD = 'platform-operator-development-only'

interface KeycloakUserRepresentation {
    id: string
    email?: string
}

interface KeycloakRoleRepresentation {
    id: string
    name: string
}

export async function ensurePlatformOperatorUser(
    api: KeycloakAdminPort,
    email: string,
    password: string,
): Promise<{ subject: string }> {
    let [user] = await api.request<KeycloakUserRepresentation[]>(
        'GET',
        `/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
    )

    if (!user) {
        await api.request(
            'POST',
            `/admin/realms/${REALM}/users`,
            { username: email, email, enabled: true, emailVerified: true, requiredActions: [] },
            [201],
        )
        ;[user] = await api.request<KeycloakUserRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
        )
        if (!user) {
            throw new Error('Keycloak user was not visible after creation')
        }
    }

    await api.request(
        'PUT',
        `/admin/realms/${REALM}/users/${user.id}/reset-password`,
        { type: 'password', value: password, temporary: false },
        [204],
    )

    return { subject: user.id }
}

export async function assignPlatformAdminRole(api: KeycloakAdminPort, subject: string): Promise<void> {
    const role = await api.request<KeycloakRoleRepresentation>('GET', `/admin/realms/${REALM}/roles/platform_admin`)

    await api.request(
        'POST',
        `/admin/realms/${REALM}/users/${subject}/role-mappings/realm`,
        [role],
        [204],
    )
}

export async function ensureExternalIdentity(
    dataSource: DataSource,
    issuer: string,
    subject: string,
    email: string,
): Promise<string> {
    const [row] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO external_identities (issuer, subject, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (issuer, subject) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [issuer, subject, email],
    )
    return row.id
}

export async function ensurePlatformOperatorMembership(
    dataSource: DataSource,
    organizationId: string,
    externalIdentityId: string,
): Promise<void> {
    await dataSource.query(
        `INSERT INTO organization_memberships ("organizationId", "externalIdentityId", role, status)
         VALUES ($1, $2, 'platform_admin', 'active')
         ON CONFLICT ("organizationId", "externalIdentityId") DO UPDATE SET
            role = 'platform_admin',
            status = 'active'`,
        [organizationId, externalIdentityId],
    )
}

export async function bootstrapPlatformOperator(
    api: KeycloakAdminPort,
    dataSource: DataSource,
    { issuer, email, password }: { issuer: string; email: string; password: string },
): Promise<{ organizationId: string; externalIdentityId: string; subject: string }> {
    const { subject } = await ensurePlatformOperatorUser(api, email, password)
    await assignPlatformAdminRole(api, subject)

    const organizationId = await ensurePlatformOrganization(dataSource)
    const externalIdentityId = await ensureExternalIdentity(dataSource, issuer, subject, email)
    await ensurePlatformOperatorMembership(dataSource, organizationId, externalIdentityId)

    return { organizationId, externalIdentityId, subject }
}
