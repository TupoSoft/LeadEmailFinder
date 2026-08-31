import { ClassSerializerInterceptor, INestApplication, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal, ServiceCredentialDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService, AuthGuard, PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ServiceClientCreationService } from '../application/service-client-creation.service'
import { ServiceClientDeletionService } from '../application/service-client-deletion.service'
import { ServiceClientDisablementService } from '../application/service-client-disablement.service'
import { ServiceClientListingService } from '../application/service-client-listing.service'
import { ServiceClientRotationService } from '../application/service-client-rotation.service'
import { ServiceClientsController } from './service-clients.controller'

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}
const creationMock: jest.Mocked<Pick<ServiceClientCreationService, 'create'>> = { create: jest.fn() }
const listingMock: jest.Mocked<Pick<ServiceClientListingService, 'list'>> = { list: jest.fn() }
const rotationMock: jest.Mocked<Pick<ServiceClientRotationService, 'rotate'>> = { rotate: jest.fn() }
const disablementMock: jest.Mocked<Pick<ServiceClientDisablementService, 'disable'>> = { disable: jest.fn() }
const deletionMock: jest.Mocked<Pick<ServiceClientDeletionService, 'delete'>> = { delete: jest.fn() }

const organizationId = '5b92ded1-7eba-4c66-b72e-a5fea465da68'
const serviceClientId = 'ec6305c4-4f02-456a-907e-88195db4c915'

function principalFixture(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId,
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

function credentialFixture(
    overrides: Partial<ServiceCredentialDetailRecord> = {},
): ServiceCredentialDetailRecord {
    return {
        id: serviceClientId,
        organizationId,
        issuer: 'https://issuer',
        subject: 'sa-1',
        keycloakClientId: 'lef-svc-1',
        description: null,
        permissions: ['verification:run'],
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }
}

@Module({
    controllers: [ServiceClientsController],
    providers: [
        Reflector,
        RolePermissionPolicy,
        PermissionsGuard,
        { provide: ServiceClientCreationService, useValue: creationMock },
        { provide: ServiceClientListingService, useValue: listingMock },
        { provide: ServiceClientRotationService, useValue: rotationMock },
        { provide: ServiceClientDisablementService, useValue: disablementMock },
        { provide: ServiceClientDeletionService, useValue: deletionMock },
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
class ServiceClientManagementHttpTestModule {}

describe('service client management HTTP boundary', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [ServiceClientManagementHttpTestModule],
        }).compile()

        app = moduleRef.createNestApplication()
        app.useGlobalPipes(new ValidationPipe())
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), { strategy: 'excludeAll', enableImplicitConversion: true }),
        )
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe(`POST /v1/organizations/:organizationId/service-clients`, () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients`)
                .send({ permissions: ['verification:run'] })
                .expect(401)
        })

        it('rejects a member (non owner/admin) with 403', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'member' }))

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients`)
                .send({ permissions: ['verification:run'] })
                .expect(403)
        })

        it('rejects a malformed permissions array with 400', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients`)
                .send({ permissions: ['not-a-real-permission'] })
                .expect(400)
        })

        it('rejects duplicate permissions with 400', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients`)
                .send({ permissions: ['verification:run', 'verification:run'] })
                .expect(400)

            expect(creationMock.create).not.toHaveBeenCalled()
        })

        it('creates a service client and returns exactly the expected JSON shape, including the one-time secret', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            creationMock.create.mockResolvedValue({ credential: credentialFixture(), secret: 'a-secret' })

            const response = await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients`)
                .send({ description: 'ci', permissions: ['verification:run'] })
                .expect(201)

            expect(response.body).toEqual({
                id: serviceClientId,
                clientId: 'lef-svc-1',
                description: null,
                permissions: ['verification:run'],
                status: 'active',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                clientSecret: 'a-secret',
            })
        })
    })

    describe(`GET /v1/organizations/:organizationId/service-clients`, () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}/service-clients`).expect(401)
        })

        it('returns the list with no secret field present anywhere in the response body', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            listingMock.list.mockResolvedValue([credentialFixture()])

            const response = await request(app.getHttpServer())
                .get(`/v1/organizations/${organizationId}/service-clients`)
                .expect(200)

            expect(response.body).toEqual([
                {
                    id: serviceClientId,
                    clientId: 'lef-svc-1',
                    description: null,
                    permissions: ['verification:run'],
                    status: 'active',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ])
            expect(JSON.stringify(response.body)).not.toContain('clientSecret')
        })
    })

    describe(`POST /v1/organizations/:organizationId/service-clients/:serviceClientId/rotate`, () => {
        it('returns the rotated credential with a new one-time secret', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            rotationMock.rotate.mockResolvedValue({ credential: credentialFixture(), secret: 'new-secret' })

            const response = await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients/${serviceClientId}/rotate`)
                .expect(200)

            expect(response.body).toMatchObject({ clientSecret: 'new-secret' })
        })
    })

    describe(`POST /v1/organizations/:organizationId/service-clients/:serviceClientId/disable`, () => {
        it('returns 204 with an empty body', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

            const response = await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/service-clients/${serviceClientId}/disable`)
                .expect(204)

            expect(response.body).toEqual({})
            expect(disablementMock.disable).toHaveBeenCalledWith(
                expect.objectContaining({ organizationId }),
                organizationId,
                serviceClientId,
            )
        })
    })

    describe(`DELETE /v1/organizations/:organizationId/service-clients/:serviceClientId`, () => {
        it('returns 204 with an empty body', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

            const response = await request(app.getHttpServer())
                .delete(`/v1/organizations/${organizationId}/service-clients/${serviceClientId}`)
                .expect(204)

            expect(response.body).toEqual({})
            expect(deletionMock.delete).toHaveBeenCalledWith(
                expect.objectContaining({ organizationId }),
                organizationId,
                serviceClientId,
            )
        })
    })
})
