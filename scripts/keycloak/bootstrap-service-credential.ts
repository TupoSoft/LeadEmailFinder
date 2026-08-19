import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import { REALM } from './provisioning'

// The 7-value permission set the running API recognises (kept as a literal, not imported: this script
// runs outside the src/ Nest application via ts-node, and duplicating this short, stable list here avoids
// depending on path-alias resolution working the same way under ts-node as it does under the app's own
// SWC/tsc build).
export const ALL_PERMISSIONS = [
    'verification:run',
    'verification:read',
    'members:manage',
    'credentials:manage',
    'billing:read',
    'billing:manage',
    'platform:admin',
]

export const PLATFORM_ORGANIZATION_NAME = 'Platform Operations (development)'

export interface ServiceClientCredentials {
    issuer: string
    clientId: string
    clientSecret: string
}

export interface ServiceCredentialSeed {
    issuer: string
    keycloakClientId: string
}

export function smtpDevIssuer(baseIssuer: string): string {
    // The containerized smtp-dev overlay's api service resolves Keycloak by its Docker service name, not
    // localhost: see docker/compose.smtp-dev.yaml's own OIDC_ISSUER_URL override for the api service.
    return baseIssuer.replace(/^https?:\/\/[^/]+/, 'http://keycloak:8080')
}

export async function resolveServiceAccountSubject(api: KeycloakAdminPort, clientId: string): Promise<string> {
    const [client] = await api.request<Array<{ id: string; clientId: string }>>(
        'GET',
        `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    )
    if (!client) {
        throw new Error(`Keycloak client ${clientId} was not found; run pnpm keycloak:provision first`)
    }
    const serviceAccountUser = await api.request<{ id: string }>(
        'GET',
        `/admin/realms/${REALM}/clients/${client.id}/service-account-user`,
    )
    return serviceAccountUser.id
}

export async function ensurePlatformOrganization(dataSource: DataSource): Promise<string> {
    const [existing] = await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM organizations WHERE name = $1',
        [PLATFORM_ORGANIZATION_NAME],
    )
    if (existing) {
        return existing.id
    }
    const [created] = await dataSource.query<Array<{ id: string }>>(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
        [PLATFORM_ORGANIZATION_NAME],
    )
    return created.id
}

export async function upsertServiceCredential(
    dataSource: DataSource,
    organizationId: string,
    subject: string,
    seed: ServiceCredentialSeed,
): Promise<void> {
    await dataSource.query(
        `INSERT INTO service_credentials
            ("organizationId", issuer, subject, "keycloakClientId", description, permissions, status)
         VALUES ($1, $2, $3, $4, $5, $6::"auth_permission"[], 'active')
         ON CONFLICT (issuer, subject) DO UPDATE SET
            "organizationId" = EXCLUDED."organizationId",
            "keycloakClientId" = EXCLUDED."keycloakClientId",
            permissions = EXCLUDED.permissions,
            status = 'active'`,
        [
            organizationId,
            seed.issuer,
            subject,
            seed.keycloakClientId,
            'Seeded platform-operator credential for local development bootstrap',
            ALL_PERMISSIONS,
        ],
    )
}

export async function bootstrapServiceCredential(
    api: KeycloakAdminPort,
    dataSource: DataSource,
    { issuer, clientId }: ServiceClientCredentials,
): Promise<{ organizationId: string; subject: string; seeds: ServiceCredentialSeed[] }> {
    const subject = await resolveServiceAccountSubject(api, clientId)
    const organizationId = await ensurePlatformOrganization(dataSource)
    const seeds: ServiceCredentialSeed[] = [
        { issuer, keycloakClientId: clientId },
        { issuer: smtpDevIssuer(issuer), keycloakClientId: clientId },
    ]
    for (const seed of seeds) {
        await upsertServiceCredential(dataSource, organizationId, subject, seed)
    }

    return { organizationId, subject, seeds }
}
