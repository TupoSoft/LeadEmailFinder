import { ClassSerializerInterceptor, INestApplication, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal, OrganizationMembershipDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService, AuthGuard, PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { InvitationPreviewService } from '../application/invitation-preview.service'
import { InvitationConsumedError, InvitationExpiredError, InvitationNotFoundError } from '../domain/organization-onboarding.errors'
import { configureInvitationResponseHeaders } from '../../../../../lead-email-finder-api/src/configure-invitation-response-headers'
import { InvitationAcceptanceService } from '../application/invitation-acceptance.service'
import { InvitationIssuanceService } from '../application/invitation-issuance.service'
import { MembershipListingService } from '../application/membership-listing.service'
import { MembershipRemovalService } from '../application/membership-removal.service'
import { MembershipRoleChangeService } from '../application/membership-role-change.service'
import { OrganizationCreationService } from '../application/organization-creation.service'
import { OrganizationDetailService } from '../application/organization-detail.service'
import { OrganizationListingService } from '../application/organization-listing.service'
import { OrganizationsController } from './organizations.controller'

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}
const organizationCreationMock: jest.Mocked<Pick<OrganizationCreationService, 'createWithFirstOwner'>> = {
    createWithFirstOwner: jest.fn(),
}
const organizationDirectoryReader = { list: jest.fn(), findById: jest.fn() }
const invitationIssuanceMock: jest.Mocked<Pick<InvitationIssuanceService, 'issue'>> = { issue: jest.fn() }
const invitationPreviewReader = { findByTokenHash: jest.fn() }
const invitationAcceptanceMock: jest.Mocked<Pick<InvitationAcceptanceService, 'accept'>> = { accept: jest.fn() }
const membershipRoleChangeMock: jest.Mocked<Pick<MembershipRoleChangeService, 'changeRole'>> = { changeRole: jest.fn() }
const membershipRemovalMock: jest.Mocked<Pick<MembershipRemovalService, 'remove'>> = { remove: jest.fn() }
const membershipListingMock: jest.Mocked<Pick<MembershipListingService, 'listForOrganization'>> = { listForOrganization: jest.fn() }

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
        { provide: OrganizationDetailService, useFactory: () => new OrganizationDetailService(organizationDirectoryReader) },
        { provide: OrganizationListingService, useFactory: () => new OrganizationListingService(organizationDirectoryReader) },
        { provide: InvitationIssuanceService, useValue: invitationIssuanceMock },
        { provide: InvitationPreviewService, useFactory: () => new InvitationPreviewService(invitationPreviewReader) },
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
        configureInvitationResponseHeaders(app)
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
                .expect('Cache-Control', 'no-store')
                .expect(401)
        })

        it('rejects a non platform-admin principal with 403', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'owner' }))

            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: 'Acme', ownerEmail: 'owner@example.test' })
                .expect('Cache-Control', 'no-store')
                .expect(403)
        })

        it('rejects a malformed body with 400', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))

            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: '', ownerEmail: 'not-an-email' })
                .expect('Cache-Control', 'no-store')
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
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
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

        it('prevents caching a malformed JSON creation request before guards and pipes run', async () => {
            await request(app.getHttpServer())
                .post('/v1/organizations')
                .set('Content-Type', 'application/json')
                .send('{"name":')
                .expect('Cache-Control', 'no-store')
                .expect(400)
            expect(organizationCreationMock.createWithFirstOwner).not.toHaveBeenCalled()
        })

        it('prevents caching an unexpected creation failure', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))
            organizationCreationMock.createWithFirstOwner.mockRejectedValue(new Error('Synthetic store failure'))
            await request(app.getHttpServer())
                .post('/v1/organizations')
                .send({ name: 'Acme', ownerEmail: 'owner@example.test' })
                .expect('Cache-Control', 'no-store')
                .expect(500)
        })
    })

    describe('GET /v1/organizations/:organizationId', () => {
        const organization = {
            id: organizationId, name: 'Synthetic detail organization',
            createdAt: new Date('2026-09-09T12:34:56.789Z'), updatedAt: new Date('2026-09-09T12:34:56.790Z'),
        }
        beforeEach(() => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))
            organizationDirectoryReader.findById.mockResolvedValue(organization)
        })

        it('returns only safe directory fields without scanning the directory', async () => {
            organizationDirectoryReader.findById.mockResolvedValue({ ...organization, balance: 123, memberships: [], token: 'excluded' })
            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}`).expect(200)
            expect(response.body).toEqual({ ...organization,
                createdAt: organization.createdAt.toISOString(), updatedAt: organization.updatedAt.toISOString() })
            expect(organizationDirectoryReader.findById).toHaveBeenCalledWith(organizationId)
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })

        it('returns a non-disclosing 404 for an absent organization', async () => {
            organizationDirectoryReader.findById.mockResolvedValue(null)
            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}`).expect(404)
            expect(response.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'Organization not found' })
        })

        it('rejects malformed UUIDs before reading', async () => {
            await request(app.getHttpServer()).get('/v1/organizations/not-a-uuid').expect(400)
            expect(organizationDirectoryReader.findById).not.toHaveBeenCalled()
        })

        it('rejects missing authentication before reading', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException())
            await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}`).expect(401)
            expect(organizationDirectoryReader.findById).not.toHaveBeenCalled()
        })

        it.each(['member', 'admin', 'owner'] as const)('rejects %s without organization data', async membershipRole => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole }))
            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}`).expect(403)
            expect(response.body).not.toHaveProperty('name')
            expect(organizationDirectoryReader.findById).not.toHaveBeenCalled()
        })

        it('maps unexpected persistence failures to a generic server response', async () => {
            organizationDirectoryReader.findById.mockRejectedValue(new Error('synthetic private store detail'))
            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}`).expect(500)
            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
        })
    })

    describe('GET /v1/organizations', () => {
        const organization = {
            id: organizationId, name: 'Synthetic directory organization',
            createdAt: new Date('2026-09-09T12:34:56.789Z'), updatedAt: new Date('2026-09-09T12:34:56.790Z'),
        }

        beforeEach(() => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole: 'platform_admin' }))
            organizationDirectoryReader.list.mockResolvedValue({ organizations: [organization], hasMore: false })
        })

        it('rejects unauthenticated requests before the directory is read', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))
            await request(app.getHttpServer()).get('/v1/organizations').expect(401)
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })

        it.each(['member', 'admin', 'owner'] as const)('denies the %s customer role without directory data', async membershipRole => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture({ membershipRole }))
            const response = await request(app.getHttpServer()).get('/v1/organizations').expect(403)
            expect(response.body).not.toHaveProperty('organizations')
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })

        it('defaults to 50 and serializes only directory fields, omitting totals, secrets, and a terminal cursor', async () => {
            organizationDirectoryReader.list.mockResolvedValue({
                organizations: [{ ...organization, token: 'synthetic-secret-excluded', ownerEmail: 'excluded@example.test' }],
                hasMore: false,
            })
            const response = await request(app.getHttpServer()).get('/v1/organizations').expect(200)
            expect(organizationDirectoryReader.list).toHaveBeenCalledWith({ limit: 50 })
            expect(response.body).toEqual({ organizations: [{
                ...organization, createdAt: organization.createdAt.toISOString(), updatedAt: organization.updatedAt.toISOString(),
            }] })
        })

        it.each([1, 100])('transforms the page size %s into the typed boundary value', async pageSize => {
            await request(app.getHttpServer()).get('/v1/organizations').query({ pageSize }).expect(200)
            expect(organizationDirectoryReader.list).toHaveBeenCalledWith({ limit: pageSize })
        })

        it('returns an empty terminal page without a cursor', async () => {
            organizationDirectoryReader.list.mockResolvedValue({ organizations: [], hasMore: false })
            const response = await request(app.getHttpServer()).get('/v1/organizations').expect(200)
            expect(response.body).toEqual({ organizations: [] })
        })

        it('returns a continuation cursor and consumes it as a typed millisecond seek key', async () => {
            organizationDirectoryReader.list.mockResolvedValueOnce({ organizations: [organization], hasMore: true })
            const first = await request(app.getHttpServer()).get('/v1/organizations').query({ pageSize: 1 }).expect(200)
            const { nextPageToken } = first.body as { nextPageToken: string }
            expect(typeof nextPageToken).toBe('string')
            await request(app.getHttpServer()).get('/v1/organizations')
                .query({ pageSize: 1, pageToken: nextPageToken }).expect(200)
            expect(organizationDirectoryReader.list).toHaveBeenLastCalledWith({
                limit: 1, before: { createdAtMilliseconds: organization.createdAt.getTime(), id: organization.id },
            })
        })

        it.each(['0', '-1', '101', '1.5', 'invalid', '', 'Infinity'])('rejects invalid page size %s', async pageSize => {
            await request(app.getHttpServer()).get('/v1/organizations').query({ pageSize }).expect(400)
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })

        it.each(['invalid', '', 'a'.repeat(513)])('rejects malformed page token case %#', async pageToken => {
            await request(app.getHttpServer()).get('/v1/organizations').query({ pageToken }).expect(400)
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })

        it('rejects repeated page-size and cursor query parameters', async () => {
            await request(app.getHttpServer()).get('/v1/organizations?pageSize=1&pageSize=2').expect(400)
            await request(app.getHttpServer()).get('/v1/organizations?pageToken=one&pageToken=two').expect(400)
            expect(organizationDirectoryReader.list).not.toHaveBeenCalled()
        })
    })

    describe('GET /v1/organizations/invitations/:token', () => {
        const record = {
            organizationName: 'Acme', email: 'invitee@example.test', role: 'member',
            expiresAt: new Date('2100-01-01T00:00:00Z'), status: 'pending',
        }
        it('previews pending display fields without authentication or cache storage', async () => {
            invitationPreviewReader.findByTokenHash.mockResolvedValue(record)
            const response = await request(app.getHttpServer())
                .get('/v1/organizations/invitations/test-authority')
                .expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer').expect(200)
            expect(authenticationServiceMock.authenticate).not.toHaveBeenCalled()
            expect(response.body).toEqual({ ...record, expiresAt: '2100-01-01T00:00:00.000Z' })
        })
        it.each([
            [undefined, 404, undefined],
            [{ ...record, expiresAt: new Date('2000-01-01T00:00:00Z') }, 410, 'invitation_expired'],
            [{ ...record, status: 'accepted' }, 410, 'invitation_consumed'],
        ])('does not disclose details for unavailable authority', async (invitation, status, code) => {
            invitationPreviewReader.findByTokenHash.mockResolvedValue(invitation)
            const response = await request(app.getHttpServer())
                .get('/v1/organizations/invitations/test-authority')
                .expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer').expect(status)
            if (code) expect(response.body).toHaveProperty('code', code)
            else expect(response.body).not.toHaveProperty('code')
            for (const key of ['organizationName', 'organizationId', 'email', 'role', 'expiresAt', 'token', 'tokenHash']) {
                expect(response.body).not.toHaveProperty(key)
            }
        })
    })

    describe('POST /v1/organizations/invitations/:token/accept', () => {
        it('serializes replay as generic accepted status without invitation details', async () => {
            invitationAcceptanceMock.accept.mockResolvedValue({ status: 'accepted' })
            const response = await request(app.getHttpServer())
                .post('/v1/organizations/invitations/test-authority/accept')
                .send({ password: 'password12345' })
                .expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer').expect(201)
            expect(response.body).toEqual({ status: 'accepted' })
        })
        it.each([new InvitationNotFoundError(), new InvitationExpiredError(), new InvitationConsumedError()])(
            'retains sensitive headers on rejected acceptance', async error => {
                invitationAcceptanceMock.accept.mockRejectedValue(error)
                const status = error instanceof InvitationNotFoundError ? 404 : 410
                await request(app.getHttpServer())
                    .post('/v1/organizations/invitations/test-authority/accept')
                    .send({ password: 'password12345' })
                    .expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer').expect(status)
            },
        )

        it('does not require authentication', async () => {
            invitationAcceptanceMock.accept.mockResolvedValue({
                organizationId: 'org-1',
                role: 'member',
                email: 'invitee@example.test',
            })

            const response = await request(app.getHttpServer())
                .post('/v1/organizations/invitations/the-token/accept')
                .send({ password: 'password12345' })
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
                .expect(201)

            expect(authenticationServiceMock.authenticate).not.toHaveBeenCalled()
            expect(response.body).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        })

        it('keeps cache and referrer protection when JSON parsing fails before the controller', async () => {
            await request(app.getHttpServer())
                .post('/v1/organizations/invitations/test-authority/accept')
                .set('Content-Type', 'application/json')
                .send('{"password":')
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
                .expect(400)
        })

        it('rejects a too-short password with 400', async () => {
            await request(app.getHttpServer())
                .post('/v1/organizations/invitations/the-token/accept')
                .send({ password: 'short' })
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
                .expect(400)
        })
    })

    describe('POST /v1/organizations/:organizationId/invitations', () => {
        it('rejects an unauthenticated request with 401', async () => {
            authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

            await request(app.getHttpServer())
                .post(`/v1/organizations/${organizationId}/invitations`)
                .send({ email: 'new@example.test', role: 'member' })
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
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
                .expect('Cache-Control', 'no-store')
                .expect('Referrer-Policy', 'no-referrer')
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
            membershipListingMock.listForOrganization.mockResolvedValue([
                {
                    id: 'membership-1',
                    organizationId,
                    externalIdentityId: 'ext-1',
                    externalIdentitySubject: 'kc-subject-1',
                    role: 'member',
                    status: 'active',
                    email: 'member@example.test',
                } satisfies OrganizationMembershipDetailRecord,
                {
                    id: 'membership-disabled', organizationId, externalIdentityId: 'ext-2',
                    externalIdentitySubject: 'kc-subject-2', role: 'member', status: 'disabled', email: null,
                } satisfies OrganizationMembershipDetailRecord,
            ])

            const response = await request(app.getHttpServer()).get(`/v1/organizations/${organizationId}/members`).expect(200)

            expect(response.body).toEqual([
                { id: 'membership-1', email: 'member@example.test', role: 'member', status: 'active' },
                { id: 'membership-disabled', email: null, role: 'member', status: 'disabled' },
            ])
        })
    })

    describe('PATCH /v1/organizations/:organizationId/members/:membershipId', () => {
        it('returns the updated membership mapped to the exact expected JSON shape', async () => {
            authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
            membershipRoleChangeMock.changeRole.mockResolvedValue({
                id: membershipId,
                organizationId,
                externalIdentityId: 'ext-1',
                externalIdentitySubject: 'kc-subject-1',
                role: 'admin',
                status: 'active',
                email: 'member@example.test',
            } satisfies OrganizationMembershipDetailRecord)

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
