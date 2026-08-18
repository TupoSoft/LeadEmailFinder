import { randomUUID } from 'node:crypto'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    CreditDebit,
    ExternalIdentity,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { InvitationIssuanceService } from './invitation-issuance.service'
import { KEYCLOAK_ORGANIZATION_ADMIN, KeycloakOrganizationAdmin } from './keycloak-organization-admin'
import { OrganizationOnboardingModule } from './organization-onboarding.module'

// Deliberately its own env vars and its own dedicated Postgres DB, not TEST_BFF_*/TEST_OIDC_*: Jest runs spec
// files in parallel workers, so sharing a database with another dropSchema:true test in the same full-suite
// run would corrupt both (the same rule already documented in every other live-Keycloak integration test).
const issuer = process.env['TEST_ORG_ISSUER_URL']
const orgAdminClientId = process.env['TEST_ORG_ADMIN_CLIENT_ID']
const orgAdminClientSecret = process.env['TEST_ORG_ADMIN_CLIENT_SECRET']
const postgresUrl = process.env['TEST_ORG_POSTGRES_URL']
const keycloakAdminUsername = process.env['TEST_ORG_KEYCLOAK_ADMIN_USERNAME']
const keycloakAdminPassword = process.env['TEST_ORG_KEYCLOAK_ADMIN_PASSWORD']

const describeWithKeycloakAndPostgres =
    issuer && orgAdminClientId && orgAdminClientSecret && postgresUrl && keycloakAdminUsername && keycloakAdminPassword
        ? describe
        : describe.skip

const identityEntities = [
    Organization,
    ExternalIdentity,
    OrganizationMembership,
    ServiceCredential,
    OrganizationCreditAccount,
    CreditDebit,
    OrganizationInvitation,
    AuditLogEntry,
]

function keycloakBaseUrl(): string {
    return issuer!.replace(/\/realms\/.+$/, '')
}

function realmName(): string {
    return issuer!.split('/realms/')[1]
}

async function authenticateKeycloakAdmin(): Promise<string> {
    const response = await fetch(`${keycloakBaseUrl()}/realms/master/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: keycloakAdminUsername!,
            password: keycloakAdminPassword!,
        }),
    })
    const payload = (await response.json()) as { access_token?: string }
    if (!response.ok || !payload.access_token) {
        throw new Error(`Keycloak admin authentication failed with HTTP ${response.status}`)
    }
    return payload.access_token
}

async function findUserByEmail(adminToken: string, email: string): Promise<{ id: string } | undefined> {
    const response = await fetch(
        `${keycloakBaseUrl()}/admin/realms/${realmName()}/users?email=${encodeURIComponent(email)}&exact=true`,
        { headers: { authorization: `Bearer ${adminToken}` } },
    )
    const users = (await response.json()) as Array<{ id: string }>
    return users[0]
}

async function getRealmRoleNames(adminToken: string, userId: string): Promise<string[]> {
    const response = await fetch(
        `${keycloakBaseUrl()}/admin/realms/${realmName()}/users/${userId}/role-mappings/realm`,
        { headers: { authorization: `Bearer ${adminToken}` } },
    )
    const roles = (await response.json()) as Array<{ name: string }>
    return roles.map(role => role.name)
}

async function deleteKeycloakUser(adminToken: string, userId: string): Promise<void> {
    await fetch(`${keycloakBaseUrl()}/admin/realms/${realmName()}/users/${userId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` },
    })
}

function actorFixture(): AuthPrincipal {
    return {
        credentialKind: 'legacy_api_key',
        issuer: 'internal:legacy-api-key',
        subject: 'admin-key-1',
        organizationId: 'unused-for-org-creation',
        membershipRole: 'platform_admin',
        permissions: [],
        credentialId: 'admin-key-1',
    }
}

describeWithKeycloakAndPostgres('KeycloakOrganizationAdmin against a live Keycloak realm', () => {
    let moduleRef: TestingModule
    let keycloakAdmin: KeycloakOrganizationAdmin
    let invitationIssuance: InvitationIssuanceService
    let invitationAcceptance: InvitationAcceptanceService
    let organizationRepo: Repository<Organization>
    let externalIdentityRepo: Repository<ExternalIdentity>
    let adminToken: string
    const createdUserIds: string[] = []

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_ORG_POSTGRES_URL must select a database whose name ends with _test')
        }

        const schemaDataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            dropSchema: true,
            synchronize: true,
            entities: identityEntities,
        })
        await schemaDataSource.initialize()
        await schemaDataSource.destroy()

        process.env['OIDC_ISSUER_URL'] = issuer
        process.env['KEYCLOAK_ORG_ADMIN_CLIENT_ID'] = orgAdminClientId
        process.env['KEYCLOAK_ORG_ADMIN_CLIENT_SECRET'] = orgAdminClientSecret

        moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ ignoreEnvFile: true }),
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: postgresUrl,
                    synchronize: false,
                    entities: identityEntities,
                }),
                OrganizationOnboardingModule,
            ],
        }).compile()

        keycloakAdmin = moduleRef.get(KEYCLOAK_ORGANIZATION_ADMIN)
        invitationIssuance = moduleRef.get(InvitationIssuanceService)
        invitationAcceptance = moduleRef.get(InvitationAcceptanceService)
        organizationRepo = moduleRef.get(getRepositoryToken(Organization))
        externalIdentityRepo = moduleRef.get(getRepositoryToken(ExternalIdentity))

        adminToken = await authenticateKeycloakAdmin()
    }, 60_000)

    afterAll(async () => {
        for (const userId of createdUserIds) {
            await deleteKeycloakUser(adminToken, userId).catch(() => undefined)
        }
        await moduleRef.close()
    }, 30_000)

    it(
        'ensureUser creates a real Keycloak user and is idempotent on retry',
        async () => {
            const email = `org-admin-test-${randomUUID()}@example.test`

            const first = await keycloakAdmin.ensureUser({ email, password: 'first-password-123' })
            const second = await keycloakAdmin.ensureUser({ email, password: 'second-password-123' })
            createdUserIds.push(first.subject)

            expect(second.subject).toBe(first.subject)
            const foundUser = await findUserByEmail(adminToken, email)
            expect(foundUser?.id).toBe(first.subject)
        },
        30_000,
    )

    it(
        "assignRealmRole('owner') verifiably grants the realm role",
        async () => {
            const email = `org-admin-role-test-${randomUUID()}@example.test`
            const { subject } = await keycloakAdmin.ensureUser({ email, password: 'a-password-123' })
            createdUserIds.push(subject)

            await keycloakAdmin.assignRealmRole(subject, 'owner')

            const roleNames = await getRealmRoleNames(adminToken, subject)
            expect(roleNames).toContain('owner')
        },
        30_000,
    )

    it(
        'drives invitation issuance and acceptance end to end, leaving an identity bff-session login could resolve',
        async () => {
            const organization = await organizationRepo.save(
                organizationRepo.create({ name: `org-admin-e2e-test-${randomUUID()}` }),
            )
            const email = `org-admin-e2e-${randomUUID()}@example.test`

            const { invitation, rawToken } = await invitationIssuance.issue(
                { ...actorFixture(), organizationId: organization.id, membershipRole: 'owner' },
                organization.id,
                email,
                'owner',
            )
            expect(invitation.status).toBe('pending')

            const result = await invitationAcceptance.accept(rawToken, 'accepted-password-123')

            expect(result).toEqual({ organizationId: organization.id, role: 'owner', email })

            const externalIdentity = await externalIdentityRepo.findOneOrFail({ where: { issuer, email } })
            createdUserIds.push(externalIdentity.subject)
            expect(externalIdentity.issuer).toBe(issuer)
            expect(externalIdentity.subject).toEqual(expect.any(String))

            const roleNames = await getRealmRoleNames(adminToken, externalIdentity.subject)
            expect(roleNames).toContain('owner')
        },
        30_000,
    )
})
