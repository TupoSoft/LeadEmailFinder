import { randomBytes, randomUUID } from 'node:crypto'
import { Controller, Get, Global, INestApplication, Module, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Redis } from 'ioredis'
import request from 'supertest'
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
import { AuthModule } from '@tuposoft/lead-email-finder/modules/auth/auth.module'
import { CurrentPrincipal } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/current-principal.decorator'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/permissions.guard'
import { RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/require-permissions.decorator'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth/application/role-permission-policy.service'
import { ServiceClientCreationService } from './service-client-creation.service'
import { ServiceClientDeletionService } from './service-client-deletion.service'
import { ServiceClientDisablementService } from './service-client-disablement.service'
import { ServiceClientRotationService } from './service-client-rotation.service'
import { ServiceClientManagementModule } from './service-client-management.module'

// Deliberately its own env vars and its own dedicated Postgres DB, not TEST_ORG_*/TEST_OIDC_*: Jest runs spec
// files in parallel workers, so sharing a database with another dropSchema:true test in the same full-suite
// run would corrupt both (the same rule already documented in every other live-Keycloak integration test).
const issuer = process.env['TEST_SVC_ISSUER_URL']
const orgAdminClientId = process.env['TEST_SVC_ORG_ADMIN_CLIENT_ID']
const orgAdminClientSecret = process.env['TEST_SVC_ORG_ADMIN_CLIENT_SECRET']
const postgresUrl = process.env['TEST_SVC_POSTGRES_URL']
const keycloakAdminUsername = process.env['TEST_SVC_KEYCLOAK_ADMIN_USERNAME']
const keycloakAdminPassword = process.env['TEST_SVC_KEYCLOAK_ADMIN_PASSWORD']

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

interface KeycloakClientRepresentation {
    id: string
    clientId: string
    serviceAccountsEnabled?: boolean
}

async function findRawKeycloakClient(adminToken: string, clientId: string): Promise<KeycloakClientRepresentation | undefined> {
    const response = await fetch(
        `${keycloakBaseUrl()}/admin/realms/${realmName()}/clients?clientId=${encodeURIComponent(clientId)}`,
        { headers: { authorization: `Bearer ${adminToken}` } },
    )
    const clients = (await response.json()) as KeycloakClientRepresentation[]
    return clients.find(client => client.clientId === clientId)
}

async function getDefaultClientScopeNames(adminToken: string, internalId: string): Promise<string[]> {
    const response = await fetch(
        `${keycloakBaseUrl()}/admin/realms/${realmName()}/clients/${internalId}/default-client-scopes`,
        { headers: { authorization: `Bearer ${adminToken}` } },
    )
    const scopes = (await response.json()) as Array<{ name: string }>
    return scopes.map(scope => scope.name)
}

async function deleteRawKeycloakClient(adminToken: string, internalId: string): Promise<void> {
    await fetch(`${keycloakBaseUrl()}/admin/realms/${realmName()}/clients/${internalId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` },
    })
}

interface TokenResponse {
    access_token?: string
    error?: string
}

async function obtainClientCredentialsToken(clientId: string, clientSecret: string): Promise<string> {
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    })
    const token = (await response.json()) as TokenResponse
    if (!response.ok || !token.access_token) {
        throw new Error(`Client Credentials failed with HTTP ${response.status}: ${token.error ?? 'unknown error'}`)
    }
    return token.access_token
}

function decodeSubject(token: string): string {
    const [, payload] = token.split('.')
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }).sub
}

// AuthModule imports BffSessionModule, whose providers need a Redis client and BFF session configuration
// even though this test never exercises browser-session behavior. lazyConnect avoids an unused, unwanted TCP
// connection attempt for a Redis instance nothing here actually calls.
@Global()
@Module({
    providers: [{ provide: Redis, useFactory: () => new Redis({ lazyConnect: true }) }],
    exports: [Redis],
})
class TestRedisModule {}

@Controller('service-client-live-test')
class ServiceClientLiveTestController {
    @UseGuards(PermissionsGuard)
    @RequirePermissions('verification:run')
    @Get('run')
    getRun(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
    }

    @UseGuards(PermissionsGuard)
    @RequirePermissions('members:manage')
    @Get('manage')
    getManage(): { ok: boolean } {
        return { ok: true }
    }
}

function actorFixture(organizationId: string): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: issuer!,
        subject: 'owner-human-1',
        organizationId,
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'external-identity-1',
    }
}

describeWithKeycloakAndPostgres('service client lifecycle against a live Keycloak realm', () => {
    let app: INestApplication
    let moduleRef: TestingModule
    let organizationRepo: Repository<Organization>
    let creationService: ServiceClientCreationService
    let rotationService: ServiceClientRotationService
    let disablementService: ServiceClientDisablementService
    let deletionService: ServiceClientDeletionService
    let organizationId: string
    let adminToken: string
    const createdInternalIds: string[] = []

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_SVC_POSTGRES_URL must select a database whose name ends with _test')
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
        process.env['OIDC_AUDIENCE'] = 'lead-email-finder-api'
        process.env['KEYCLOAK_ORG_ADMIN_CLIENT_ID'] = orgAdminClientId
        process.env['KEYCLOAK_ORG_ADMIN_CLIENT_SECRET'] = orgAdminClientSecret
        // AuthModule -> BffSessionModule needs these to construct its configuration provider, even though
        // this test never drives a browser session. Values are unused placeholders, not exercised here.
        process.env['APP_BASE_URL'] = 'http://localhost:53000'
        process.env['BFF_CLIENT_ID'] = 'lef-web-bff'
        process.env['BFF_CLIENT_SECRET'] = 'unused-in-this-test'
        process.env['SESSION_ENCRYPTION_KEY'] = randomBytes(32).toString('base64url')

        moduleRef = await Test.createTestingModule({
            imports: [
                TestRedisModule,
                ConfigModule.forRoot({ ignoreEnvFile: true }),
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: postgresUrl,
                    synchronize: false,
                    entities: identityEntities,
                }),
                AuthModule,
                ServiceClientManagementModule,
            ],
            controllers: [ServiceClientLiveTestController],
            providers: [RolePermissionPolicy, PermissionsGuard],
        }).compile()

        app = moduleRef.createNestApplication()
        await app.init()

        organizationRepo = moduleRef.get(getRepositoryToken(Organization))
        creationService = moduleRef.get(ServiceClientCreationService)
        rotationService = moduleRef.get(ServiceClientRotationService)
        disablementService = moduleRef.get(ServiceClientDisablementService)
        deletionService = moduleRef.get(ServiceClientDeletionService)

        const organization = await organizationRepo.save(
            organizationRepo.create({ name: `service-client-live-test-${randomUUID()}` }),
        )
        organizationId = organization.id

        adminToken = await authenticateKeycloakAdmin()
    }, 60_000)

    afterAll(async () => {
        for (const internalId of createdInternalIds) {
            await deleteRawKeycloakClient(adminToken, internalId).catch(() => undefined)
        }
        await app.close()
        await moduleRef.close()
    }, 30_000)

    it(
        'create -> token -> use -> rotate -> disable -> delete',
        async () => {
            const actor = actorFixture(organizationId)

            const created = await creationService.create(actor, organizationId, 'ci integration', ['verification:run'])
            const rawClient = await findRawKeycloakClient(adminToken, created.credential.keycloakClientId)
            if (!rawClient) {
                throw new Error('Keycloak client was not visible after creation')
            }
            createdInternalIds.push(rawClient.id)

            expect(rawClient.serviceAccountsEnabled).toBe(true)
            const defaultScopeNames = await getDefaultClientScopeNames(adminToken, rawClient.id)
            expect(defaultScopeNames).toContain('lef-api-audience')

            const firstToken = await obtainClientCredentialsToken(created.credential.keycloakClientId, created.secret)
            expect(decodeSubject(firstToken)).toBe(created.credential.subject)

            await request(app.getHttpServer())
                .get('/service-client-live-test/run')
                .set('authorization', `Bearer ${firstToken}`)
                .expect(200)
            await request(app.getHttpServer())
                .get('/service-client-live-test/manage')
                .set('authorization', `Bearer ${firstToken}`)
                .expect(403)

            const rotated = await rotationService.rotate(actor, organizationId, created.credential.id)
            await expect(
                obtainClientCredentialsToken(created.credential.keycloakClientId, created.secret),
            ).rejects.toThrow()
            const secondToken = await obtainClientCredentialsToken(created.credential.keycloakClientId, rotated.secret)
            await request(app.getHttpServer())
                .get('/service-client-live-test/run')
                .set('authorization', `Bearer ${secondToken}`)
                .expect(200)

            const preDisableToken = await obtainClientCredentialsToken(
                created.credential.keycloakClientId,
                rotated.secret,
            )
            await disablementService.disable(actor, organizationId, created.credential.id)
            await request(app.getHttpServer())
                .get('/service-client-live-test/run')
                .set('authorization', `Bearer ${preDisableToken}`)
                .expect(401)

            await deletionService.delete(actor, organizationId, created.credential.id)
            const rawClientAfterDelete = await findRawKeycloakClient(adminToken, created.credential.keycloakClientId)
            expect(rawClientAfterDelete).toBeUndefined()
            await request(app.getHttpServer())
                .get('/service-client-live-test/run')
                .set('authorization', `Bearer ${preDisableToken}`)
                .expect(401)
        },
        60_000,
    )
})
