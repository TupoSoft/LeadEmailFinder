import { ClassSerializerInterceptor, INestApplication, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from '@tuposoft/lead-email-finder/modules/auth/application/authentication.service'
import { AuthGuard } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/auth.guard'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { InvitationIssuanceService } from './invitation-issuance.service'
import { MembershipListingService } from './membership-listing.service'
import { MembershipRemovalService } from './membership-removal.service'
import { MembershipRoleChangeService } from './membership-role-change.service'
import { OrganizationCreationService } from './organization-creation.service'
import { OrganizationsController } from './organizations.controller'

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}
const organizationCreationMock: jest.Mocked<Pick<OrganizationCreationService, 'createWithFirstOwner'>> = {
    createWithFirstOwner: jest.fn(),
}
const invitationIssuanceMock: jest.Mocked<Pick<InvitationIssuanceService, 'issue'>> = { issue: jest.fn() }
const invitationAcceptanceMock: jest.Mocked<Pick<InvitationAcceptanceService, 'accept'>> = { accept: jest.fn() }
const membershipRoleChangeMock: jest.Mocked<Pick<MembershipRoleChangeService, 'changeRole'>> = { changeRole: jest.fn() }
const membershipRemovalMock: jest.Mocked<Pick<MembershipRemovalService, 'remove'>> = { remove: jest.fn() }
const membershipListingMock: jest.Mocked<Pick<MembershipListingService, 'listActive'>> = { listActive: jest.fn() }

const organizationId = '5b92ded1-7eba-4c66-b72e-a5fea465da68'
const membershipId = 'ec6305c4-4f02-456a-907e-88195db4c915'

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

@Module({
    controllers: [OrganizationsController],
    providers: [
        Reflector,
        RolePermissionPolicy,
        PermissionsGuard,
        { provide: OrganizationCreationService, useValue: organizationCreationMock },
        { provide: InvitationIssuanceService, useValue: invitationIssuanceMock },
        { provide: InvitationAcceptanceService, useValue: invitationAcceptanceMock },
        { provide: MembershipRoleChangeService, useValue: membershipRoleChangeMock },
        { provide: MembershipRemovalService, useValue: membershipRemovalMock },
        { provide: MembershipListingService, useValue: membershipListingMock },
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
class OrganizationOnboardingHttpTestModule {}

describe('organization onboarding HTTP boundary', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [OrganizationOnboardingHttpTestModule],
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

    describe('POST /v1/organizations', () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: 'Acme', ownerEmail: 'owner@example.test' })
                .expect(401)
        })

        it('rejects a non platform-admin principal with 403', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'owner' }))

            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: 'Acme', ownerEmail: 'owner@example.test' })
                .expect(403)
        })

        it('rejects a malformed body with 400', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))

            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: '', ownerEmail: 'not-an-email' })
                .expect(400)
        })

        it('creates an organization and returns exactly the expected JSON shape', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))
            organizationCreationMock.createWithFirstOwner.mockResolvedValue({
                organization: { id: 'org-1' } as never,
                invitation: {
                    id: 'invitation-1',
                    email: 'owner@example.test',
                    role: 'owner',
                    expiresAt: new Date('2026-01-01T00:00:00.000Z'),
                } as never,
                rawToken: 'raw-token-value',
            })

            const response = await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: 'Acme', ownerEmail: 'owner@example.test' })
                .expect(201)

            expect(response.body).toEqual({
                organizationId: 'org-1',
                invitation: {
                    id: 'invitation-1',
                    email: 'owner@example.test',
                    role: 'owner',
                    expiresAt: '2026-01-01T00:00:00.000Z',
                    token: 'raw-token-value',
                },
            })
        })
    })

    describe('POST /v1/organizations/invitations/:token/accept', () => {
        it('does not require authentication', async () => {
            invitationAcceptanceMock.accept.mockResolvedValue({
                organizationId: 'org-1',
                role: 'member',
                email: 'invitee@example.test',
            })

            const response = await request(app.getHttpServer())
                .post('/v1/organizations/invitations/the-token/accept')
                .send({ password: 'password12345' })
                .expect(201)

            expect(authenticationServiceMock.authenticate).not.toHaveBeenCalled()
            expect(response.body).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        })

        it('rejects a too-short password with 400', async () => {
            await request(app.getHttpServer())
                .post('/v1/organizations/invitations/the-token/accept')
                .send({ password: 'short' })
                .expect(400)
        })
    })

    describe('POST /v1/organizations/:organizationId/invitations', () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/invitations`)
                .send({ email: 'new@example.test', role: 'member' })
                .expect(401)
        })

        it('issues an invitation and returns exactly the expected JSON shape', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            invitationIssuanceMock.issue.mockResolvedValue({
                invitation: {
                    id: 'invitation-2',
                    email: 'new@example.test',
                    role: 'member',
                    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
                } as never,
                rawToken: 'another-raw-token',
            })

            const response = await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/invitations`)
                .send({ email: 'new@example.test', role: 'member' })
                .expect(201)

            expect(response.body).toEqual({
                id: 'invitation-2',
                email: 'new@example.test',
                role: 'member',
                expiresAt: '2026-01-02T00:00:00.000Z',
                token: 'another-raw-token',
            })
        })
    })

    describe('GET /v1/organizations/:organizationId/members', () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}/members`).expect(401)
        })

        it('returns the member list mapped to the exact expected JSON shape', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            membershipListingMock.listActive.mockResolvedValue([
                {
                    id: 'membership-1',
                    role: 'member',
                    status: 'active',
                    externalIdentity: { email: 'member@example.test' },
                } as OrganizationMembership,
            ])

            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}/members`).expect(200)

            expect(response.body).toEqual([
                { id: 'membership-1', email: 'member@example.test', role: 'member', status: 'active' },
            ])
        })
    })

    describe('PATCH /v1/organizations/:organizationId/members/:membershipId', () => {
        it('returns the updated membership mapped to the exact expected JSON shape', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            membershipRoleChangeMock.changeRole.mockResolvedValue({
                id: membershipId,
                role: 'admin',
                status: 'active',
                externalIdentity: { email: 'member@example.test' },
            } as OrganizationMembership)

            const response = await request(app.getHttpServer())
                .patch(`/v1/organizations/${organizationId}/members/${membershipId}`)
                .send({ role: 'admin' })
                .expect(200)

            expect(response.body).toEqual({ id: membershipId, email: 'member@example.test', role: 'admin', status: 'active' })
        })
    })

    describe('DELETE /v1/organizations/:organizationId/members/:membershipId', () => {
        it('returns 204 with an empty body', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

            const response = await request(app.getHttpServer())
                .delete(`/v1/organizations/${organizationId}/members/${membershipId}`)
                .expect(204)

            expect(response.body).toEqual({})
            expect(membershipRemovalMock.remove).toHaveBeenCalledWith(
                expect.objectContaining({ organizationId }),
                organizationId,
                membershipId,
            )
        })
    })
})
