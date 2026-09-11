import { randomBytes, randomUUID } from 'node:crypto'
import { load } from 'cheerio'
import { ClassSerializerInterceptor, Global, INestApplication, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Redis } from 'ioredis'
import { decodeJwt } from 'jose'
import request from 'supertest'
import {
    Organization,
    OrganizationMembership,
    ExternalIdentity,
    OrganizationCreditAccount,
    CreditReservation,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthenticationService,
    AuthGuard,
    AuthModule,
    CredentialExtractor,
    OidcCredentialAuthenticator,
} from '@tuposoft/lead-email-finder/modules/auth'
import {
    BffSessionCredentialAuthenticator,
    BffSessionModule,
    BrowserSessionMutationGuard,
} from '@tuposoft/lead-email-finder/modules/bff-session'
import { BFF_CSRF_COOKIE_NAME } from './api/bff-cookie-names'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './application/bff-session-configuration'
import { OAUTH_PROVIDER_CLIENT, OAuthProviderClient } from './application/oauth-provider-client'
import { SESSION_STORE, SessionStore } from './application/session-store'

// Deliberately its own env vars, not TEST_OIDC_*/TEST_POSTGRES_URL: this test drives a real Keycloak
// browser login (distinct from the M2M client-credentials tests) and does its own dropSchema+synchronize
// against its own database. Jest runs spec files in parallel workers, so sharing a database with another
// dropSchema:true test in the same full-suite run would corrupt both.
const issuer = process.env['TEST_BFF_ISSUER_URL']
const clientId = process.env['TEST_BFF_CLIENT_ID']
const clientSecret = process.env['TEST_BFF_CLIENT_SECRET']
const postgresUrl = process.env['TEST_BFF_POSTGRES_URL']
const redisUrl = process.env['TEST_BFF_REDIS_URL']
const keycloakAdminUsername = process.env['TEST_BFF_KEYCLOAK_ADMIN_USERNAME']
const keycloakAdminPassword = process.env['TEST_BFF_KEYCLOAK_ADMIN_PASSWORD']
const backchannelUrl = process.env['TEST_BFF_BACKCHANNEL_URL'] ?? issuer
const jwksUri = process.env['TEST_BFF_JWKS_URI'] ?? `${issuer}/protocol/openid-connect/certs`

const describeWithKeycloakRedisAndPostgres =
    issuer && clientId && clientSecret && postgresUrl && redisUrl && keycloakAdminUsername && keycloakAdminPassword
        ? describe
        : describe.skip

const appBaseUrl = process.env['TEST_BFF_APP_BASE_URL'] ?? 'http://localhost:53000'
const identityEntities = [
    Organization,
    ExternalIdentity,
    OrganizationMembership,
    ServiceCredential,
    OrganizationCreditAccount,
    CreditReservation,
]

// BffSessionModule injects Redis without importing RedisModule itself, relying on it being registered
// globally elsewhere in the real app (via DnsModule). This test's module graph has no such registration,
// so a global module supplies one directly.
@Global()
@Module({
    providers: [{ provide: Redis, useFactory: () => new Redis(redisUrl!) }],
    exports: [Redis],
})
class TestRedisModule {}

function keycloakBaseUrl(): string {
    return backchannelUrl!.replace(/\/realms\/.+$/, '')
}

function realmName(): string {
    return issuer!.split('/realms/')[1]
}

// The simulated browser runs in the API container during test:bff-live. Assert each browser URL is public,
// then route only this browser driver's HTTP transport to Keycloak; the application receives no rewrite.
function browserTransportUrl(publicUrl: string): string {
    const url = new URL(publicUrl)
    expect(url.origin).toBe(new URL(issuer!).origin)
    const transport = new URL(backchannelUrl!)
    url.host = transport.host
    url.protocol = transport.protocol
    return url.toString()
}

class CookieJar {
    private readonly cookies = new Map<string, string>()

    applyResponse(response: Response): void {
        for (const setCookie of response.headers.getSetCookie()) {
            const pair = setCookie.split(';')[0]
            const separatorIndex = pair.indexOf('=')
            if (separatorIndex === -1) continue
            this.cookies.set(pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1).trim())
        }
    }

    header(): string {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ')
    }
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

async function createKeycloakUser(adminToken: string, username: string, password: string): Promise<string> {
    const response = await fetch(`${keycloakBaseUrl()}/admin/realms/${realmName()}/users`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            username,
            enabled: true,
            emailVerified: true,
            email: `${username}@example.test`,
            // Keycloak's declarative user profile requires firstName/lastName by default; omitting them
            // triggers an automatic VERIFY_PROFILE required action regardless of requiredActions: [] below,
            // which would block the login flow at a Keycloak-hosted page before reaching our callback.
            firstName: 'Test',
            lastName: 'User',
            requiredActions: [],
            credentials: [{ type: 'password', value: password, temporary: false }],
        }),
    })
    if (response.status !== 201) {
        throw new Error(`Failed to create Keycloak user: HTTP ${response.status}`)
    }
    const location = response.headers.get('location')
    if (!location) {
        throw new Error('Keycloak did not return a Location header for the created user')
    }
    return location.split('/').pop()!
}

async function assignRealmRole(adminToken: string, userId: string, roleName: string): Promise<void> {
    const roleResponse = await fetch(`${keycloakBaseUrl()}/admin/realms/${realmName()}/roles/${roleName}`, {
        headers: { authorization: `Bearer ${adminToken}` },
    })
    const role = await roleResponse.json()
    const response = await fetch(
        `${keycloakBaseUrl()}/admin/realms/${realmName()}/users/${userId}/role-mappings/realm`,
        {
            method: 'POST',
            headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
            body: JSON.stringify([role]),
        },
    )
    if (!response.ok) {
        throw new Error(`Failed to assign realm role ${roleName}: HTTP ${response.status}`)
    }
}

async function deleteKeycloakUser(adminToken: string, userId: string): Promise<void> {
    await fetch(`${keycloakBaseUrl()}/admin/realms/${realmName()}/users/${userId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` },
    })
}

interface BrowserLoginAttemptResult {
    readonly reachedCallback: boolean
    readonly callbackUrl?: URL
}

/**
 * Drives Keycloak's hosted login form with a real username/password submission, using our app's own
 * /v1/auth/login redirect as the entry point. Returns whether the flow reached our callback URL with an
 * authorization code (false for a flow blocked mid-way, e.g. by an MFA requirement).
 */
async function attemptBrowserLogin(
    app: INestApplication,
    username: string,
    password: string,
): Promise<{ result: BrowserLoginAttemptResult; loginStateCookie: string }> {
    const loginResponse = await request(app.getHttpServer()).get('/v1/auth/login').redirects(0)
    expect(loginResponse.status).toBe(302)
    const authorizationUrl: string = loginResponse.headers.location
    expect(new URL(authorizationUrl).origin).toBe(new URL(issuer!).origin)
    expect(new URL(authorizationUrl).pathname).toBe(`${new URL(issuer!).pathname}/protocol/openid-connect/auth`)
    const loginStateCookieHeader = (loginResponse.headers['set-cookie'] as unknown as string[]).find(cookie =>
        cookie.startsWith('lef_login_state='),
    )
    if (!loginStateCookieHeader) {
        throw new Error('Expected /v1/auth/login to set a lef_login_state cookie')
    }
    const loginStateCookie = loginStateCookieHeader.split(';')[0]

    const keycloakJar = new CookieJar()
    const formResponse = await fetch(browserTransportUrl(authorizationUrl), { redirect: 'manual' })
    keycloakJar.applyResponse(formResponse)
    const formHtml = await formResponse.text()
    const $ = load(formHtml)
    const formAction = $('#kc-form-login').attr('action') ?? $('form').first().attr('action')
    if (!formAction) {
        throw new Error('Could not find the Keycloak login form action URL')
    }

    const submitResponse = await fetch(browserTransportUrl(formAction), {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            cookie: keycloakJar.header(),
        },
        body: new URLSearchParams({ username, password, credentialId: '' }),
    })
    keycloakJar.applyResponse(submitResponse)
    const redirectLocation = submitResponse.headers.get('location')

    if (!redirectLocation || !redirectLocation.startsWith(appBaseUrl)) {
        return { result: { reachedCallback: false }, loginStateCookie }
    }

    return { result: { reachedCallback: true, callbackUrl: new URL(redirectLocation) }, loginStateCookie }
}

describeWithKeycloakRedisAndPostgres('BFF session flow against a live Keycloak realm', () => {
    let app: INestApplication
    let redis: Redis
    let organizationRepo: Repository<Organization>
    let externalIdentityRepo: Repository<ExternalIdentity>
    let membershipRepo: Repository<OrganizationMembership>
    let adminToken: string
    let sessionStore: SessionStore
    let oauthProvider: OAuthProviderClient
    let fetchSpy: jest.SpiedFunction<typeof fetch>
    const protocolRequests: Array<{ url: string; grantType: string | null; status: number }> = []
    const sessionIds: string[] = []
    const createdUserIds: string[] = []

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_BFF_POSTGRES_URL must select a database whose name ends with _test')
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
        process.env['OIDC_BACKCHANNEL_URL'] = backchannelUrl
        process.env['OIDC_JWKS_URI'] = jwksUri
        process.env['OIDC_AUDIENCE'] = 'lead-email-finder-api'
        process.env['APP_BASE_URL'] = appBaseUrl
        process.env['BFF_CLIENT_ID'] = clientId
        process.env['BFF_CLIENT_SECRET'] = clientSecret
        process.env['SESSION_ENCRYPTION_KEY'] = randomBytes(32).toString('base64url')

        if (process.env['TEST_BFF_EXPECT_PUBLIC_UNREACHABLE'] === 'true') {
            await expect(
                fetch(`${issuer}/protocol/openid-connect/certs`, { signal: AbortSignal.timeout(3_000) }),
            ).rejects.toThrow()
        }
        const originalFetch = globalThis.fetch
        fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const response = await originalFetch(input, init)
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
            if (
                url.pathname.endsWith('/protocol/openid-connect/token') ||
                url.pathname.endsWith('/protocol/openid-connect/logout')
            ) {
                protocolRequests.push({
                    url: `${url.origin}${url.pathname}`,
                    grantType: init?.body instanceof URLSearchParams ? init.body.get('grant_type') : null,
                    status: response.status,
                })
            }
            return response
        })

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
                BffSessionModule,
            ],
            providers: [
                {
                    provide: AuthenticationService,
                    useFactory: (
                        extractor: CredentialExtractor,
                        oidc: OidcCredentialAuthenticator,
                        bffSession: BffSessionCredentialAuthenticator,
                    ) => new AuthenticationService(extractor, [oidc, bffSession]),
                    inject: [CredentialExtractor, OidcCredentialAuthenticator, BffSessionCredentialAuthenticator],
                },
                AuthGuard,
                { provide: APP_GUARD, useExisting: AuthGuard },
                { provide: APP_GUARD, useExisting: BrowserSessionMutationGuard },
            ],
        }).compile()

        app = moduleRef.createNestApplication()
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()

        organizationRepo = moduleRef.get(getRepositoryToken(Organization))
        externalIdentityRepo = moduleRef.get(getRepositoryToken(ExternalIdentity))
        membershipRepo = moduleRef.get(getRepositoryToken(OrganizationMembership))
        redis = moduleRef.get(Redis)
        sessionStore = moduleRef.get(SESSION_STORE)
        oauthProvider = moduleRef.get(OAUTH_PROVIDER_CLIENT)
        const configuration = moduleRef.get<BffSessionConfiguration>(BFF_SESSION_CONFIGURATION)
        expect(configuration.issuer).toBe(issuer)
        expect(configuration.backchannelUrl).toBe(backchannelUrl)
        expect(configuration.jwksUri).toBe(jwksUri)

        adminToken = await authenticateKeycloakAdmin()
    }, 60_000)

    afterAll(async () => {
        for (const userId of createdUserIds) {
            await deleteKeycloakUser(adminToken, userId).catch(() => undefined)
        }
        for (const sessionId of sessionIds) await sessionStore?.delete(sessionId)
        fetchSpy?.mockRestore()
        await redis?.quit()
        await app?.close()
    }, 30_000)

    it('publishes the current account, preserves null email, and rejects post-guard and disabled membership state', async () => {
        const username = `bff-test-member-${randomUUID()}`
        const password = randomBytes(12).toString('base64url')
        const userId = await createKeycloakUser(adminToken, username, password)
        createdUserIds.push(userId)

        const organization = await organizationRepo.save(
            organizationRepo.create({ name: `bff-test-org-${randomUUID()}` }),
        )
        const externalIdentity = await externalIdentityRepo.save(
            externalIdentityRepo.create({ issuer, subject: userId, email: `${username}@example.test` }),
        )
        const membership = await membershipRepo.save(
            membershipRepo.create({
                organizationId: organization.id,
                externalIdentityId: externalIdentity.id,
                role: 'member',
                status: 'active',
            }),
        )

        const { result, loginStateCookie } = await attemptBrowserLogin(app, username, password)
        expect(result.reachedCallback).toBe(true)

        const callbackResponse = await request(app.getHttpServer())
            .get(`${result.callbackUrl!.pathname}${result.callbackUrl!.search}`)
            .set('cookie', loginStateCookie)
            .redirects(0)
        expect(callbackResponse.status).toBe(302)
        expect(callbackResponse.headers.location).toBe(`${appBaseUrl}/app`)
        expect(callbackResponse.headers['cache-control']).toBe('no-store')
        expect(callbackResponse.headers['referrer-policy']).toBe('no-referrer')

        const setCookies = callbackResponse.headers['set-cookie'] as unknown as string[]
        expect(setCookies).toEqual(
            expect.arrayContaining([
                expect.stringMatching(
                    /^lef_login_state=;.*Path=\/v1\/auth;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT.*HttpOnly.*SameSite=Lax/i,
                ),
            ]),
        )
        const sessionCookie = setCookies.find(cookie => cookie.startsWith('lef_session='))!.split(';')[0]
        sessionIds.push(sessionCookie.slice('lef_session='.length))

        expect(
            protocolRequests.some(
                entry =>
                    entry.grantType === 'authorization_code' &&
                    entry.url === `${backchannelUrl}/protocol/openid-connect/token` &&
                    entry.status === 200,
            ),
        ).toBe(true)

        const sessionResponse = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', sessionCookie)
            .expect(200)
        const expectedAccount = {
            email: `${username}@example.test`,
            membership: { id: membership.id, role: 'member' },
            organization: { id: organization.id, name: organization.name },
            capabilities: ['verification.run', 'verification.read'],
            grantableServiceClientPermissions: [],
        }
        expect(sessionResponse.body).toEqual(expectedAccount)
        for (const internalField of ['credentialKind', 'issuer', 'subject', 'credentialId', 'permissions']) {
            expect(sessionResponse.body).not.toHaveProperty(internalField)
        }
        expect(JSON.stringify(sessionResponse.body)).not.toMatch(/access_token|refresh_token|id_token/i)

        await externalIdentityRepo.update(externalIdentity.id, { email: null })
        const nullEmailResponse = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', sessionCookie)
            .expect(200)
        expect(nullEmailResponse.body).toEqual({ ...expectedAccount, email: null })

        const unexpectedOrganization = await organizationRepo.save(
            organizationRepo.create({ name: `bff-test-unexpected-org-${randomUUID()}` }),
        )
        const unexpectedMembership = await membershipRepo.save(
            membershipRepo.create({
                organizationId: unexpectedOrganization.id,
                externalIdentityId: externalIdentity.id,
                role: 'member',
                status: 'active',
            }),
        )
        const unavailableAccountResponse = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', sessionCookie)
            .expect(401)
        expect(unavailableAccountResponse.body).toEqual({ code: 'authentication_required' })

        await membershipRepo.update(unexpectedMembership.id, { status: 'disabled' })
        await membershipRepo.update(membership.id, { status: 'disabled' })

        const disabledMembershipResponse = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', sessionCookie)
            .expect(401)
        expect(disabledMembershipResponse.body).toEqual({ code: 'authentication_required' })
    }, 30_000)

    it('refreshes and revokes the provider session through the back channel while enforcing Origin and CSRF', async () => {
        const username = `bff-test-csrf-${randomUUID()}`
        const password = randomBytes(12).toString('base64url')
        const userId = await createKeycloakUser(adminToken, username, password)
        createdUserIds.push(userId)

        const organization = await organizationRepo.save(
            organizationRepo.create({ name: `bff-test-csrf-org-${randomUUID()}` }),
        )
        const externalIdentity = await externalIdentityRepo.save(
            externalIdentityRepo.create({ issuer, subject: userId, email: `${username}@example.test` }),
        )
        await membershipRepo.save(
            membershipRepo.create({
                organizationId: organization.id,
                externalIdentityId: externalIdentity.id,
                role: 'member',
                status: 'active',
            }),
        )

        const { result, loginStateCookie } = await attemptBrowserLogin(app, username, password)
        expect(result.reachedCallback).toBe(true)

        const callbackResponse = await request(app.getHttpServer())
            .get(`${result.callbackUrl!.pathname}${result.callbackUrl!.search}`)
            .set('cookie', loginStateCookie)
            .redirects(0)
        expect(callbackResponse.status).toBe(302)

        const setCookies = callbackResponse.headers['set-cookie'] as unknown as string[]
        const sessionCookie = setCookies.find(cookie => cookie.startsWith('lef_session='))!.split(';')[0]
        const sessionId = sessionCookie.slice('lef_session='.length)
        sessionIds.push(sessionId)
        const csrfCookie = setCookies.find(cookie => cookie.startsWith(`${BFF_CSRF_COOKIE_NAME}=`))!.split(';')[0]
        const csrfToken = csrfCookie.split('=')[1]
        const bothCookies = `${sessionCookie}; ${csrfCookie}`

        const initialSession = await sessionStore.get(sessionId)
        expect(initialSession).toBeDefined()
        expect(decodeJwt(initialSession!.accessToken).iss).toBe(issuer)
        await sessionStore.save(sessionId, { ...initialSession!, accessTokenExpiresAt: Date.now() - 1 })
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie).expect(200)
        const refreshedSession = await sessionStore.get(sessionId)
        expect(refreshedSession!.accessTokenExpiresAt).toBeGreaterThan(Date.now())
        expect(decodeJwt(refreshedSession!.accessToken).iss).toBe(issuer)
        expect(
            protocolRequests.some(
                entry =>
                    entry.grantType === 'refresh_token' &&
                    entry.url === `${backchannelUrl}/protocol/openid-connect/token` &&
                    entry.status === 200,
            ),
        ).toBe(true)

        // Missing Origin/Referer entirely.
        await request(app.getHttpServer()).post('/v1/auth/logout').set('cookie', bothCookies).expect(403)

        // A cross-origin attacker page sending the victim's cookie and a spoofed CSRF header pair it made
        // up itself: this is the exact attack this guard exists to stop, so it must fail even though the
        // attacker can freely choose a header value that "matches" a cookie it also controls.
        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', 'https://evil.example.test')
            .set('cookie', bothCookies)
            .set('x-csrf-token', csrfToken)
            .expect(403)

        // Correct Origin, missing CSRF header.
        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', appBaseUrl)
            .set('cookie', bothCookies)
            .expect(403)

        // Correct Origin, CSRF header present but not matching the cookie.
        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', appBaseUrl)
            .set('cookie', bothCookies)
            .set('x-csrf-token', 'not-the-real-token')
            .expect(403)

        // Every rejected mutation above must have left the session intact.
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie).expect(200)

        // Matching Origin and CSRF token reaches the controller and actually logs out.
        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', appBaseUrl)
            .set('cookie', bothCookies)
            .set('x-csrf-token', csrfToken)
            .expect(204)

        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie).expect(401)
        expect(
            protocolRequests.some(
                entry => entry.url === `${backchannelUrl}/protocol/openid-connect/logout` && entry.status === 204,
            ),
        ).toBe(true)
        await expect(oauthProvider.refreshTokens(refreshedSession!.refreshToken)).rejects.toThrow()
    }, 30_000)

    it('rejects a replayed authorization code and state', async () => {
        const username = `bff-test-replay-${randomUUID()}`
        const password = randomBytes(12).toString('base64url')
        const userId = await createKeycloakUser(adminToken, username, password)
        createdUserIds.push(userId)

        const organization = await organizationRepo.save(
            organizationRepo.create({ name: `bff-test-org-${randomUUID()}` }),
        )
        const externalIdentity = await externalIdentityRepo.save(
            externalIdentityRepo.create({ issuer, subject: userId, email: `${username}@example.test` }),
        )
        await membershipRepo.save(
            membershipRepo.create({
                organizationId: organization.id,
                externalIdentityId: externalIdentity.id,
                role: 'member',
                status: 'active',
            }),
        )

        const { result, loginStateCookie } = await attemptBrowserLogin(app, username, password)
        expect(result.reachedCallback).toBe(true)

        const firstCallback = await request(app.getHttpServer())
            .get(`${result.callbackUrl!.pathname}${result.callbackUrl!.search}`)
            .set('cookie', loginStateCookie)
            .redirects(0)
        expect(firstCallback.status).toBe(302)
        const sessionCookie = (firstCallback.headers['set-cookie'] as unknown as string[])
            .find(cookie => cookie.startsWith('lef_session='))!
            .split(';')[0]
        sessionIds.push(sessionCookie.slice('lef_session='.length))

        const replayedCallback = await request(app.getHttpServer())
            .get(`${result.callbackUrl!.pathname}${result.callbackUrl!.search}`)
            .set('cookie', loginStateCookie)
            .redirects(0)
        expect(replayedCallback.status).toBe(302)
        expect(replayedCallback.headers.location).toBe(`${appBaseUrl}/auth/error?code=login_state_invalid`)
        expect(replayedCallback.headers['cache-control']).toBe('no-store')
        expect(replayedCallback.headers['referrer-policy']).toBe('no-referrer')
        expect(replayedCallback.headers.location).not.toContain(result.callbackUrl!.searchParams.get('code'))
        expect(replayedCallback.headers.location).not.toContain(result.callbackUrl!.searchParams.get('state'))
        expect(replayedCallback.headers['set-cookie']).toEqual(
            expect.arrayContaining([
                expect.stringMatching(
                    /^lef_login_state=;.*Path=\/v1\/auth;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT.*HttpOnly.*SameSite=Lax/i,
                ),
            ]),
        )
    }, 30_000)

    it('blocks an owner-role user from completing login without satisfying the MFA requirement', async () => {
        const username = `bff-test-owner-${randomUUID()}`
        const password = randomBytes(12).toString('base64url')
        const userId = await createKeycloakUser(adminToken, username, password)
        createdUserIds.push(userId)
        await assignRealmRole(adminToken, userId, 'owner')

        const organization = await organizationRepo.save(
            organizationRepo.create({ name: `bff-test-org-${randomUUID()}` }),
        )
        const externalIdentity = await externalIdentityRepo.save(
            externalIdentityRepo.create({ issuer, subject: userId, email: `${username}@example.test` }),
        )
        await membershipRepo.save(
            membershipRepo.create({
                organizationId: organization.id,
                externalIdentityId: externalIdentity.id,
                role: 'owner',
                status: 'active',
            }),
        )

        const { result } = await attemptBrowserLogin(app, username, password)

        expect(result.reachedCallback).toBe(false)
    }, 30_000)
})
