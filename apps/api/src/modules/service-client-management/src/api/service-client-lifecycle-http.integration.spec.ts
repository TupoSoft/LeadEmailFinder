import { FactoryProvider, INestApplication } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthModule,
    AuthenticationService,
    AuthGuard,
    PermissionsGuard,
    RolePermissionPolicy,
    SERVICE_CLIENT_GRANT_POLICY,
    ServiceClientGrantPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { configureApiSerialization } from '../../../../configure-api-serialization'
import { configureServiceClientResponseHeaders } from '../../../../configure-service-client-response-headers'
import { generateApiKey } from '../infrastructure/api-key-generator'
import { ServiceClientCreationService } from '../application/service-client-creation.service'
import { ServiceClientDeletionService } from '../application/service-client-deletion.service'
import { ServiceClientDisablementService } from '../application/service-client-disablement.service'
import { ServiceClientListingService } from '../application/service-client-listing.service'
import { ServiceClientRotationService } from '../application/service-client-rotation.service'
import { ServiceClientsController } from './service-clients.controller'
import { ServiceClientResponseDto, ServiceClientSecretResponseDto } from './service-clients.dto'

const organizationId = '5b92ded1-7eba-4c66-b72e-a5fea465da68'
const otherOrganizationId = '256e4aaf-31a1-4910-b1e3-e4c1e87dacaa'
const basePath = `/v1/organizations/${organizationId}/service-clients`
const timestamp = new Date('2026-01-01T00:00:00.000Z')

/** Real application use cases and auth-owned grant policy, with disposable provider/persistence ports. */
describe('service-client HTTP application lifecycle', () => {
    let app: INestApplication
    let actor: AuthPrincipal
    let grantPolicy: ServiceClientGrantPolicy
    const records = new Map<string, ServiceCredentialDetailRecord>()

    beforeAll(async () => {
        // Reuse the production public module wiring without exposing auth's private policy implementation.
        const authProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as FactoryProvider[]
        const grantProvider = authProviders.find(entry => entry.provide === SERVICE_CLIENT_GRANT_POLICY)!
        const policyModule = await Test.createTestingModule({
            providers: [RolePermissionPolicy, grantProvider],
        }).compile()
        grantPolicy = policyModule.get<ServiceClientGrantPolicy>(SERVICE_CLIENT_GRANT_POLICY)
        await policyModule.close()

        const directory: ServiceCredentialDirectory = {
            listForOrganization(org) {
                return Promise.resolve([...records.values()].filter(row => row.organizationId === org))
            },
            findByIdForOrganization(id, org) {
                const row = records.get(id)
                return Promise.resolve(row?.organizationId === org ? row : undefined)
            },
        }
        const writer: ServiceCredentialWriter = {
            createWithAudit(command) {
                const row: ServiceCredentialDetailRecord = {
                    id: command.id,
                    organizationId: command.organizationId,
                    issuer: command.issuer,
                    subject: command.subject,
                    keyPrefix: command.keyPrefix,
                    description: command.description,
                    permissions: command.permissions,
                    status: 'active',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                }
                records.set(row.id, row)
                return Promise.resolve(row)
            },
            rotateWithAudit(row) {
                return Promise.resolve({ kind: 'rotated', credential: row })
            },
            disableWithAudit(row) {
                records.set(row.id, { ...row, status: 'disabled' })
                return Promise.resolve(row.status === 'disabled' ? 'already-disabled' : 'disabled')
            },
            deleteWithAudit(row) {
                records.delete(row.id)
                return Promise.resolve('deleted')
            },
        }
        const moduleRef = await Test.createTestingModule({
            controllers: [ServiceClientsController],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                { provide: AuthenticationService, useValue: { authenticate: () => Promise.resolve(actor) } },
                { provide: APP_GUARD, useClass: AuthGuard },
                {
                    provide: ServiceClientCreationService,
                    useValue: new ServiceClientCreationService(writer, grantPolicy, generateApiKey),
                },
                { provide: ServiceClientListingService, useValue: new ServiceClientListingService(directory) },
                {
                    provide: ServiceClientRotationService,
                    useValue: new ServiceClientRotationService(directory, writer, generateApiKey),
                },
                {
                    provide: ServiceClientDisablementService,
                    useValue: new ServiceClientDisablementService(directory, writer),
                },
                {
                    provide: ServiceClientDeletionService,
                    useValue: new ServiceClientDeletionService(directory, writer),
                },
            ],
        }).compile()
        app = moduleRef.createNestApplication({ logger: false })
        configureServiceClientResponseHeaders(app)
        configureApiSerialization(app)
        await app.init()
    })

    beforeEach(() => {
        records.clear()
        jest.clearAllMocks()
        actor = {
            credentialKind: 'human_session',
            issuer: 'https://issuer',
            subject: 'owner-1',
            organizationId,
            membershipRole: 'owner',
            permissions: [],
            credentialId: 'identity-1',
        }
    })

    afterAll(async () => {
        await app.close()
    })

    it.each(['admin', 'owner'] as const)(
        'accepts exactly the auth-owned ordered %s grant choices and rejects a broader grant',
        async role => {
            actor = { ...actor, membershipRole: role }
            const choices = grantPolicy.grantablePermissionsFor(role)
            const created: { body: ServiceClientSecretResponseDto } = await request(app.getHttpServer())
                .post(basePath)
                .send({ permissions: choices })
                .expect(201)
            expect(created.body.permissions).toEqual(choices)
            expect(created.body.apiKey).toMatch(/^lef_[A-Za-z0-9_-]{43}$/)
            expect(choices).toEqual(
                role === 'admin'
                    ? ['verification:run', 'verification:read', 'members:manage', 'credentials:manage']
                    : [
                          'verification:run',
                          'verification:read',
                          'members:manage',
                          'credentials:manage',
                          'billing:read',
                          'billing:manage',
                      ],
            )

            await request(app.getHttpServer())
                .post(basePath)
                .send({ permissions: [...choices, role === 'admin' ? 'billing:manage' : 'platform:admin'] })
                .expect('Cache-Control', 'no-store')
                .expect(400)
        },
    )

    it('creates, lists, rotates, disables and deletes through the real application services', async () => {
        const created: { body: ServiceClientSecretResponseDto } = await request(app.getHttpServer())
            .post(basePath)
            .send({ description: 'CI fixture', permissions: ['verification:run'] })
            .expect('Cache-Control', 'no-store')
            .expect(201)
        const memberPath = `${basePath}/${created.body.id}`
        const listed: { body: ServiceClientResponseDto[] } = await request(app.getHttpServer())
            .get(basePath)
            .expect(200)
        expect(listed.body).toHaveLength(1)
        expect(listed.body[0].status).toBe('active')
        expect(JSON.stringify(listed.body)).not.toContain('apiKey')
        const rotated: { body: ServiceClientSecretResponseDto } = await request(app.getHttpServer())
            .post(`${memberPath}/rotate`)
            .expect('Cache-Control', 'no-store')
            .expect(200)
        expect(rotated.body.apiKey).toMatch(/^lef_[A-Za-z0-9_-]{43}$/)
        expect(rotated.body.apiKey).not.toBe(created.body.apiKey)
        await request(app.getHttpServer()).post(`${memberPath}/disable`).expect(204)
        await request(app.getHttpServer()).post(`${memberPath}/disable`).expect(204)
        const disabled: { body: ServiceClientResponseDto[] } = await request(app.getHttpServer())
            .get(basePath)
            .expect(200)
        expect(disabled.body[0].status).toBe('disabled')
        expect(JSON.stringify(disabled.body)).not.toContain('apiKey')
        await request(app.getHttpServer()).post(`${memberPath}/rotate`).expect('Cache-Control', 'no-store').expect(409)
        await request(app.getHttpServer()).delete(memberPath).expect(204)
        expect((await request(app.getHttpServer()).get(basePath).expect(200)).body).toEqual([])
    })

    it('conceals a client in another organization exactly like a missing client on every member operation', async () => {
        const created: { body: ServiceClientSecretResponseDto } = await request(app.getHttpServer())
            .post(basePath)
            .send({ permissions: ['verification:run'] })
            .expect(201)
        const otherBase = `/v1/organizations/${otherOrganizationId}/service-clients`
        for (const [method, suffix] of [
            ['post', '/rotate'],
            ['post', '/disable'],
            ['delete', ''],
        ] as const) {
            const http = request(app.getHttpServer())
            const concealed = await http[method](`${otherBase}/${created.body.id}${suffix}`).expect(404)
            const absent = await http[method](`${basePath}/${otherOrganizationId}${suffix}`).expect(404)
            expect(concealed.body).toEqual(absent.body)
        }
        await request(app.getHttpServer()).get(otherBase).expect(403)
        await request(app.getHttpServer())
            .post(otherBase)
            .send({ permissions: ['verification:run'] })
            .expect(403)
    })

    it.each(['service_client', 'member', 'platform_admin'] as const)(
        'rejects %s administration on every operation',
        async kind => {
            const created: { body: ServiceClientSecretResponseDto } = await request(app.getHttpServer())
                .post(basePath)
                .send({ permissions: ['verification:run'] })
                .expect(201)
            actor =
                kind === 'service_client'
                    ? { ...actor, credentialKind: 'service_client', permissions: ['credentials:manage'] }
                    : { ...actor, membershipRole: kind }
            await request(app.getHttpServer())
                .post(basePath)
                .send({ permissions: ['verification:run'] })
                .expect(403)
            await request(app.getHttpServer()).get(basePath).expect(403)
            await request(app.getHttpServer()).post(`${basePath}/${created.body.id}/rotate`).expect(403)
            await request(app.getHttpServer()).post(`${basePath}/${created.body.id}/disable`).expect(403)
            await request(app.getHttpServer()).delete(`${basePath}/${created.body.id}`).expect(403)
        },
    )
})
