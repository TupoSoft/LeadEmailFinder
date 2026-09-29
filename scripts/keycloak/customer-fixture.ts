import { DataSource } from 'typeorm'
import { ServiceCredentialSeed } from './bootstrap-service-credential'
import { KeycloakAdminPort } from './keycloak-admin-api'
import { REALM } from './provisioning'
import { CUSTOMER_OWNER_EMAIL, CUSTOMER_OWNER_PASSWORD } from './browser-fixture-identities'
import { configureBrowserFixtureMfa, findBrowserFixtureUser } from './browser-fixture-seed'
export { CUSTOMER_OWNER_EMAIL, CUSTOMER_OWNER_PASSWORD } from './browser-fixture-identities'

export const CUSTOMER_ORGANIZATION_NAME = 'Acme Development Customer'
export const CUSTOMER_CREDIT_BALANCE = 1000
// This is exactly MEMBER_PERMISSIONS (src/libs/modules/auth/src/application/role-permission-policy.service.ts):
// the narrowest realistic set a customer integration would need (submit/poll verifications), deliberately
// excluding members:manage/credentials:manage/billing:*/platform:admin.
export const CUSTOMER_SERVICE_CLIENT_PERMISSIONS = ['verification:run', 'verification:read', 'billing:read']
// Fixed, not a random lef-svc-<uuid>: there is exactly one instance of this fixture by construction, and a
// fixed name makes it trivially identifiable as seeded (not self-service-created) and keeps this script's own
// find-or-create idempotent across repeated runs outside a full reset.
export const CUSTOMER_SERVICE_CLIENT_ID = 'lef-svc-dev-fixture'

const AUDIENCE_SCOPE_NAME = 'lef-api-audience'

interface TokenResponse {
    access_token?: string
    error?: string
}

interface CreateOrganizationResponse {
    organizationId: string
    invitation: { token: string }
}

export async function createOrganizationWithOwner(
    apiUrl: string,
    platformToken: string,
    fetchImpl: typeof fetch,
): Promise<{ organizationId: string; invitationToken: string }> {
    const response = await fetchImpl(`${apiUrl}/v1/organizations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${platformToken}` },
        body: JSON.stringify({ name: CUSTOMER_ORGANIZATION_NAME, ownerEmail: CUSTOMER_OWNER_EMAIL }),
    })
    if (!response.ok) {
        throw new Error(`POST /v1/organizations failed with HTTP ${response.status}: ${await response.text()}`)
    }
    const body = (await response.json()) as CreateOrganizationResponse
    return { organizationId: body.organizationId, invitationToken: body.invitation.token }
}

export async function acceptOwnerInvitation(
    apiUrl: string,
    invitationToken: string,
    password: string,
    fetchImpl: typeof fetch,
): Promise<void> {
    const response = await fetchImpl(
        `${apiUrl}/v1/organizations/invitations/${encodeURIComponent(invitationToken)}/accept`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password }),
        },
    )
    if (!response.ok) {
        throw new Error(`POST .../accept failed with HTTP ${response.status}: ${await response.text()}`)
    }
}

export async function setCreditBalance(
    apiUrl: string,
    platformToken: string,
    organizationId: string,
    amount: number,
    fetchImpl: typeof fetch,
): Promise<number> {
    const response = await fetchImpl(`${apiUrl}/credits/${organizationId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${platformToken}` },
        body: JSON.stringify({ amount }),
    })
    if (!response.ok) {
        throw new Error(`PUT /credits/${organizationId} failed with HTTP ${response.status}: ${await response.text()}`)
    }
    const body = (await response.json()) as { balance: number }
    return body.balance
}

interface KeycloakClientRepresentation {
    id?: string
    clientId: string
}

interface NamedRepresentation {
    id?: string
    name?: string
}

async function findClientInternalId(api: KeycloakAdminPort, keycloakClientId: string): Promise<string | undefined> {
    const clients = await api.request<KeycloakClientRepresentation[]>(
        'GET',
        `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(keycloakClientId)}`,
    )
    return clients.find(client => client.clientId === keycloakClientId)?.id
}

export async function provisionCustomerServiceClient(
    api: KeycloakAdminPort,
    keycloakClientId: string,
): Promise<{ subject: string; secret: string }> {
    let internalId = await findClientInternalId(api, keycloakClientId)
    if (!internalId) {
        await api.request(
            'POST',
            `/admin/realms/${REALM}/clients`,
            {
                clientId: keycloakClientId,
                name: `Lead Email Finder development fixture client ${keycloakClientId}`,
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
        internalId = await findClientInternalId(api, keycloakClientId)
        if (!internalId) {
            throw new Error('Keycloak client was not visible after creation')
        }
    }

    const scopes = await api.request<NamedRepresentation[]>('GET', `/admin/realms/${REALM}/client-scopes`)
    const audienceScope = scopes.find(scope => scope.name === AUDIENCE_SCOPE_NAME)
    if (!audienceScope) {
        throw new Error(`Keycloak client scope ${AUDIENCE_SCOPE_NAME} was not found; run pnpm keycloak:provision first`)
    }
    const defaultScopes = await api.request<NamedRepresentation[]>(
        'GET',
        `/admin/realms/${REALM}/clients/${internalId}/default-client-scopes`,
    )
    if (!defaultScopes.some(scope => scope.id === audienceScope.id)) {
        await api.request(
            'PUT',
            `/admin/realms/${REALM}/clients/${internalId}/default-client-scopes/${audienceScope.id}`,
            undefined,
            [204],
        )
    }

    const secret = await api.request<{ value: string }>(
        'GET',
        `/admin/realms/${REALM}/clients/${internalId}/client-secret`,
    )
    const serviceAccountUser = await api.request<{ id: string }>(
        'GET',
        `/admin/realms/${REALM}/clients/${internalId}/service-account-user`,
    )

    return { subject: serviceAccountUser.id, secret: secret.value }
}

export async function upsertCustomerServiceCredential(
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
            'Seeded customer-fixture credential for local development',
            CUSTOMER_SERVICE_CLIENT_PERMISSIONS,
        ],
    )
}

export interface CustomerFixtureSummary {
    issuer: string
    organizationId: string
    ownerEmail: string
    ownerSubject: string
    keycloakClientId: string
    issuers: string[]
}

export async function seedCustomerFixture(deps: {
    apiUrl: string
    issuer: string
    platformToken: string
    api: KeycloakAdminPort
    dataSource: DataSource
    fetchImpl: typeof fetch
    previousFixture?: CustomerFixtureSummary
    expectedIssuer?: string
}): Promise<CustomerFixtureSummary> {
    const { apiUrl, issuer, platformToken, api, dataSource, fetchImpl, previousFixture, expectedIssuer } = deps

    let owner = await findBrowserFixtureUser(api, issuer, 'owner', CUSTOMER_OWNER_EMAIL, expectedIssuer)
    const newlyCreated = !owner
    let organizationId: string
    if (owner) {
        if (
            previousFixture?.issuer !== issuer ||
            previousFixture.ownerEmail !== CUSTOMER_OWNER_EMAIL ||
            previousFixture.ownerSubject !== owner.id ||
            !previousFixture.organizationId
        ) {
            throw new Error('Refusing to change an existing owner without matching development fixture provenance.')
        }
        organizationId = previousFixture.organizationId
        const [membership] = await dataSource.query<Array<{ matches: boolean }>>(
            `SELECT EXISTS (
                SELECT 1 FROM external_identities identity
                JOIN organization_memberships membership ON membership."externalIdentityId" = identity.id
                WHERE identity.issuer = $1 AND identity.subject = $2 AND membership."organizationId" = $3
                    AND membership.role = 'owner' AND membership.status = 'active'
            ) AS matches`,
            [issuer, owner.id, organizationId],
        )
        if (!membership?.matches) {
            throw new Error('The existing customer seed does not match an active owner membership.')
        }
    } else {
        const created = await createOrganizationWithOwner(apiUrl, platformToken, fetchImpl)
        organizationId = created.organizationId
        await acceptOwnerInvitation(apiUrl, created.invitationToken, CUSTOMER_OWNER_PASSWORD, fetchImpl)
        owner = await findBrowserFixtureUser(api, issuer, 'owner', CUSTOMER_OWNER_EMAIL, expectedIssuer)
        if (!owner) throw new Error('The customer owner was not visible after invitation acceptance.')
    }
    await configureBrowserFixtureMfa(api, {
        issuer,
        label: 'owner',
        email: CUSTOMER_OWNER_EMAIL,
        subject: owner.id,
        newlyCreated,
        previousSubject: previousFixture?.ownerSubject,
        expectedIssuer,
    })
    await setCreditBalance(apiUrl, platformToken, organizationId, CUSTOMER_CREDIT_BALANCE, fetchImpl)

    const { subject } = await provisionCustomerServiceClient(api, CUSTOMER_SERVICE_CLIENT_ID)
    const seeds: ServiceCredentialSeed[] = [{ issuer, keycloakClientId: CUSTOMER_SERVICE_CLIENT_ID }]
    for (const seed of seeds) {
        await upsertCustomerServiceCredential(dataSource, organizationId, subject, seed)
    }

    return {
        issuer,
        organizationId,
        ownerEmail: CUSTOMER_OWNER_EMAIL,
        ownerSubject: owner.id,
        keycloakClientId: CUSTOMER_SERVICE_CLIENT_ID,
        issuers: seeds.map(seed => seed.issuer),
    }
}

export async function obtainClientCredentialsToken(
    issuer: string,
    clientId: string,
    clientSecret: string,
    fetchImpl: typeof fetch,
): Promise<string> {
    const response = await fetchImpl(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }),
    })
    const token = (await response.json()) as TokenResponse
    if (!response.ok || !token.access_token) {
        throw new Error(`Client Credentials failed with HTTP ${response.status}: ${token.error ?? 'unknown error'}`)
    }
    return token.access_token
}
