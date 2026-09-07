import { DataSource } from 'typeorm'
import { ensurePlatformOrganization } from './bootstrap-service-credential'
import { KeycloakAdminPort } from './keycloak-admin-api'
import { REALM } from './provisioning'
import { DEVELOPMENT_BROWSER_ISSUER } from './browser-fixture-identities'
import { configureBrowserFixtureMfa, findBrowserFixtureUser } from './browser-fixture-seed'
export { PLATFORM_OPERATOR_EMAIL, PLATFORM_OPERATOR_PASSWORD } from './browser-fixture-identities'

interface KeycloakRoleRepresentation {
    id: string
    name: string
}

export async function ensurePlatformOperatorUser(
    api: KeycloakAdminPort,
    email: string,
    password: string,
    options: { issuer?: string; expectedIssuer?: string; previousSubject?: string } = {},
): Promise<{ subject: string; newlyCreated: boolean }> {
    const issuer = options.issuer ?? DEVELOPMENT_BROWSER_ISSUER
    let user = await findBrowserFixtureUser(api, issuer, 'platformOperator', email, options.expectedIssuer)
    const newlyCreated = !user

    if (user && user.id !== options.previousSubject) {
        throw new Error('Refusing to change an existing user without matching development fixture provenance.')
    }

    if (!user) {
        await api.request(
            'POST',
            `/admin/realms/${REALM}/users`,
            {
                username: email,
                email,
                enabled: true,
                emailVerified: true,
                requiredActions: [],
                firstName: 'Platform',
                lastName: 'Operator',
            },
            [201],
        )
        user = await findBrowserFixtureUser(api, issuer, 'platformOperator', email, options.expectedIssuer)
        if (!user) {
            throw new Error('Keycloak user was not visible after creation')
        }
    }

    if (newlyCreated) {
        await api.request(
            'PUT',
            `/admin/realms/${REALM}/users/${user.id}/reset-password`,
            { type: 'password', value: password, temporary: false },
            [204],
        )
    }

    return { subject: user.id, newlyCreated }
}

export async function assignPlatformAdminRole(api: KeycloakAdminPort, subject: string): Promise<void> {
    const role = await api.request<KeycloakRoleRepresentation>('GET', `/admin/realms/${REALM}/roles/platform_admin`)

    await api.request('POST', `/admin/realms/${REALM}/users/${subject}/role-mappings/realm`, [role], [204])
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
    {
        issuer,
        email,
        password,
        previousSubject,
        expectedIssuer,
    }: {
        issuer: string
        email: string
        password: string
        previousSubject?: string
        expectedIssuer?: string
    },
): Promise<{ organizationId: string; externalIdentityId: string; subject: string }> {
    const { subject, newlyCreated } = await ensurePlatformOperatorUser(api, email, password, {
        issuer,
        previousSubject,
        expectedIssuer,
    })
    if (newlyCreated) await assignPlatformAdminRole(api, subject)
    await configureBrowserFixtureMfa(api, {
        issuer,
        label: 'platformOperator',
        email,
        subject,
        newlyCreated,
        previousSubject,
        expectedIssuer,
    })

    const organizationId = await ensurePlatformOrganization(dataSource)
    const externalIdentityId = await ensureExternalIdentity(dataSource, issuer, subject, email)
    await ensurePlatformOperatorMembership(dataSource, organizationId, externalIdentityId)

    return { organizationId, externalIdentityId, subject }
}
