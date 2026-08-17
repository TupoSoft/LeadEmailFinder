import { randomBytes } from 'node:crypto'
import { Controller, Get, Global, INestApplication, Module, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Redis } from 'ioredis'
import request from 'supertest'
import {
    AuthPrincipal,
    ExternalIdentity,
    Organization,
    OrganizationCreditAccount,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { Key } from '@tuposoft/lead-email-finder/modules/api-key/models/key.entity'
import { RolePermissionPolicy } from './application/role-permission-policy.service'
import { AuthModule } from './auth.module'
import { CurrentPrincipal } from './infrastructure/http/current-principal.decorator'
import { PermissionsGuard } from './infrastructure/http/permissions.guard'
import { RequirePermissions } from './infrastructure/http/require-permissions.decorator'

// Deliberately its own env var, not TEST_POSTGRES_URL: identity-schema.integration.spec.ts also gates on
// TEST_POSTGRES_URL and does its own dropSchema+synchronize. Jest runs spec files in parallel workers, so
// both tests racing dropSchema against the same database in one full-suite run would corrupt each other.
const postgresUrl = process.env['TEST_OIDC_POSTGRES_URL']
const issuer = process.env['TEST_OIDC_ISSUER_URL']
const clientId = process.env['TEST_OIDC_CLIENT_ID']
const clientSecret = process.env['TEST_OIDC_CLIENT_SECRET']
const audience = process.env['TEST_OIDC_AUDIENCE']

const describeWithKeycloakAndPostgres =
    postgresUrl && issuer && clientId && clientSecret && audience ? describe : describe.skip

const identityEntities = [Key, Organization, ExternalIdentity, OrganizationMembership, ServiceCredential, OrganizationCreditAccount]

interface TokenResponse {
    access_token?: string
    error?: string
}

async function obtainClientCredentialsToken(): Promise<string> {
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId!,
            client_secret: clientSecret!,
        }),
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

// AuthModule now imports BffSessionModule (added by PR 6), whose providers need a Redis client and BFF
// session configuration even though this test never exercises browser-session behavior. lazyConnect avoids
// an unused, unwanted TCP connection attempt for a Redis instance nothing here actually calls.
@Global()
@Module({
    providers: [{ provide: Redis, useFactory: () => new Redis({ lazyConnect: true }) }],
    exports: [Redis],
})
class TestRedisModule {}

@Controller('oidc-permission-check-test')
class OidcPermissionCheckTestController {
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

describeWithKeycloakAndPostgres('a real OIDC token against a real PermissionsGuard-gated route', () => {
    let app: INestApplication
    let serviceCredentialRepo: Repository<ServiceCredential>
    let organizationId: string

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_OIDC_POSTGRES_URL must select a database whose name ends with _test')
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

        // Forwarded, not read directly: createOidcConfiguration() reads OIDC_ISSUER_URL/OIDC_AUDIENCE via
        // ConfigService, so AuthModule can point at the real Keycloak realm used by every other TEST_OIDC_* test.
        process.env['OIDC_ISSUER_URL'] = issuer
        process.env['OIDC_AUDIENCE'] = audience
        // AuthModule -> BffSessionModule needs these to construct its configuration provider, even though
        // this test never drives a browser session. Values are unused placeholders, not exercised here.
        process.env['APP_BASE_URL'] = 'http://localhost:53000'
        process.env['BFF_CLIENT_ID'] = 'lef-web-bff'
        process.env['BFF_CLIENT_SECRET'] = 'unused-in-this-test'
        process.env['SESSION_ENCRYPTION_KEY'] = randomBytes(32).toString('base64url')

        const moduleRef: TestingModule = await Test.createTestingModule({
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
            ],
            controllers: [OidcPermissionCheckTestController],
            providers: [RolePermissionPolicy, PermissionsGuard],
        }).compile()

        app = moduleRef.createNestApplication()
        await app.init()

        serviceCredentialRepo = moduleRef.get(getRepositoryToken(ServiceCredential))
        const organizationRepo = moduleRef.get<Repository<Organization>>(getRepositoryToken(Organization))
        const organization = await organizationRepo.save(
            organizationRepo.create({ name: 'oidc-permission-check-test-org' }),
        )
        organizationId = organization.id
    })

    afterAll(async () => {
        await app.close()
    })

    afterEach(async () => {
        await serviceCredentialRepo.delete({ issuer })
    })

    it('succeeds against a route requiring a permission the credential is configured with', async () => {
        const token = await obtainClientCredentialsToken()
        const subject = decodeSubject(token)
        await serviceCredentialRepo.save(
            serviceCredentialRepo.create({
                organizationId,
                issuer,
                subject,
                permissions: ['verification:run'],
                status: 'active',
            }),
        )

        const response = await request(app.getHttpServer())
            .get('/oidc-permission-check-test/run')
            .set('authorization', `Bearer ${token}`)
            .expect(200)

        expect(response.body).toMatchObject({
            credentialKind: 'service_client',
            issuer,
            subject,
            organizationId,
        })
    })

    it('rejects with 403 against a route requiring a permission the credential is not configured with', async () => {
        const token = await obtainClientCredentialsToken()
        const subject = decodeSubject(token)
        await serviceCredentialRepo.save(
            serviceCredentialRepo.create({
                organizationId,
                issuer,
                subject,
                permissions: ['verification:run'],
                status: 'active',
            }),
        )

        await request(app.getHttpServer())
            .get('/oidc-permission-check-test/manage')
            .set('authorization', `Bearer ${token}`)
            .expect(403)
    })

    it('rejects with 401 when the matching service credential is disabled', async () => {
        const token = await obtainClientCredentialsToken()
        const subject = decodeSubject(token)
        await serviceCredentialRepo.save(
            serviceCredentialRepo.create({
                organizationId,
                issuer,
                subject,
                permissions: ['verification:run'],
                status: 'disabled',
            }),
        )

        await request(app.getHttpServer())
            .get('/oidc-permission-check-test/run')
            .set('authorization', `Bearer ${token}`)
            .expect(401)
    })

    it('rejects with 401 when no service credential matches the token at all', async () => {
        const token = await obtainClientCredentialsToken()

        await request(app.getHttpServer())
            .get('/oidc-permission-check-test/run')
            .set('authorization', `Bearer ${token}`)
            .expect(401)
    })
})
