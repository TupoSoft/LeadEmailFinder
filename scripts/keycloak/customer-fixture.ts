import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import { CUSTOMER_OWNER_EMAIL, CUSTOMER_OWNER_PASSWORD } from './browser-fixture-identities'
import { configureBrowserFixtureMfa, findBrowserFixtureUser } from './browser-fixture-seed'
export { CUSTOMER_OWNER_EMAIL, CUSTOMER_OWNER_PASSWORD } from './browser-fixture-identities'

export const CUSTOMER_ORGANIZATION_NAME = 'Acme Development Customer'
export const CUSTOMER_CREDIT_BALANCE = 1000
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
        throw new Error(`POST /v1/organizations failed with HTTP ${response.status}`)
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
        throw new Error(`POST .../accept failed with HTTP ${response.status}`)
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
        throw new Error(`PUT /credits/${organizationId} failed with HTTP ${response.status}`)
    }
    const body = (await response.json()) as { balance: number }
    return body.balance
}

export interface CustomerFixtureSummary {
    issuer: string
    organizationId: string
    ownerEmail: string
    ownerSubject: string
    credentialId: string
    keyPrefix: string
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
    seedApiKey: (organizationId: string) => Promise<{ credentialId: string; keyPrefix: string }>
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

    const credential = await deps.seedApiKey(organizationId)

    return {
        issuer,
        organizationId,
        ownerEmail: CUSTOMER_OWNER_EMAIL,
        ownerSubject: owner.id,
        credentialId: credential.credentialId,
        keyPrefix: credential.keyPrefix,
        issuers: [issuer],
    }
}
