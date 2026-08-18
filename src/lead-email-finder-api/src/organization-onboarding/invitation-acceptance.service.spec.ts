import { ConflictException, GoneException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource, EntityManager, Repository } from 'typeorm'
import {
    AuditLogEntry,
    ExternalIdentity,
    HumanIdentityResolver,
    OrganizationInvitation,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'
import { hashInvitationToken } from './invitation-token'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { KeycloakOrganizationAdmin } from './keycloak-organization-admin'

const issuer = 'https://issuer'

function invitationFixture(overrides: Partial<OrganizationInvitation> = {}): OrganizationInvitation {
    return {
        id: 'invitation-1',
        organizationId: 'org-1',
        email: 'invitee@example.test',
        role: 'member',
        tokenHash: hashInvitationToken('the-raw-token'),
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: null,
        acceptedByExternalIdentityId: null,
        invitedByCredentialKind: 'human_session',
        invitedByIssuer: issuer,
        invitedBySubject: 'inviter-1',
        invitedByCredentialId: 'inviter-identity-1',
        ...overrides,
    } as OrganizationInvitation
}

describe('InvitationAcceptanceService', () => {
    let invitationRepoMock: jest.Mocked<Pick<Repository<OrganizationInvitation>, 'findOne'>> & {
        manager: { insert: jest.Mock }
    }
    let managerMock: jest.Mocked<
        Pick<EntityManager, 'findOne' | 'count' | 'update' | 'findOneByOrFail' | 'save' | 'create' | 'insert'>
    >
    let dataSourceMock: { transaction: jest.Mock }
    let humanIdentityResolverMock: jest.Mocked<Pick<HumanIdentityResolver, 'resolveOrCreate'>>
    let keycloakAdminMock: jest.Mocked<KeycloakOrganizationAdmin>
    let configServiceMock: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>
    let service: InvitationAcceptanceService

    beforeEach(() => {
        invitationRepoMock = { findOne: jest.fn(), manager: { insert: jest.fn() } }
        managerMock = {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            findOneByOrFail: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            insert: jest.fn(),
        }
        managerMock.create.mockImplementation((entity, data) => data as never)
        managerMock.save.mockImplementation((entity: any, data: any) => Promise.resolve({ id: 'membership-1', ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        humanIdentityResolverMock = { resolveOrCreate: jest.fn() }
        humanIdentityResolverMock.resolveOrCreate.mockResolvedValue({
            id: 'external-identity-1',
        } as ExternalIdentity)
        keycloakAdminMock = { ensureUser: jest.fn(), assignRealmRole: jest.fn() }
        keycloakAdminMock.ensureUser.mockResolvedValue({ subject: 'keycloak-subject-1' })
        configServiceMock = { getOrThrow: jest.fn().mockReturnValue(issuer) }

        service = new InvitationAcceptanceService(
            invitationRepoMock as unknown as Repository<OrganizationInvitation>,
            dataSourceMock as unknown as DataSource,
            humanIdentityResolverMock as unknown as HumanIdentityResolver,
            keycloakAdminMock,
            configServiceMock as unknown as ConfigService,
        )
    })

    it('throws NotFoundException for an unknown token', async () => {
        invitationRepoMock.findOne.mockResolvedValue(null)

        await expect(service.accept('unknown-token', 'password12345')).rejects.toThrow(NotFoundException)
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('throws GoneException for an expired invitation without calling Keycloak', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture({ expiresAt: new Date(Date.now() - 1000) }))

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow(GoneException)
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('returns the same result idempotently for an already-accepted invitation without calling Keycloak again', async () => {
        invitationRepoMock.findOne.mockResolvedValue(
            invitationFixture({ status: 'accepted', role: 'admin', email: 'invitee@example.test' }),
        )

        const result = await service.accept('the-raw-token', 'password12345')

        expect(result).toEqual({ organizationId: 'org-1', role: 'admin', email: 'invitee@example.test' })
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('creates the human identity and membership on a happy-path acceptance', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture())

        const result = await service.accept('the-raw-token', 'password12345')

        expect(keycloakAdminMock.ensureUser).toHaveBeenCalledWith({
            email: 'invitee@example.test',
            password: 'password12345',
        })
        expect(humanIdentityResolverMock.resolveOrCreate).toHaveBeenCalledWith(
            issuer,
            'keycloak-subject-1',
            'invitee@example.test',
            managerMock,
        )
        expect(managerMock.create).toHaveBeenCalledWith(
            OrganizationMembership,
            expect.objectContaining({ organizationId: 'org-1', externalIdentityId: 'external-identity-1', role: 'member' }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'invitation.accepted' }),
        )
        expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
    })

    it('assigns the Keycloak realm role only for owner/admin invitations, never member', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture({ role: 'member' }))

        await service.accept('the-raw-token', 'password12345')

        expect(keycloakAdminMock.assignRealmRole).not.toHaveBeenCalled()
    })

    it('assigns the Keycloak realm role for an owner invitation', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture({ role: 'owner' }))

        await service.accept('the-raw-token', 'password12345')

        expect(keycloakAdminMock.assignRealmRole).toHaveBeenCalledWith('keycloak-subject-1', 'owner')
    })

    it('leaves the invitation pending and writes a failure audit row when the Keycloak call fails', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture())
        keycloakAdminMock.ensureUser.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow('keycloak unreachable')

        expect(invitationRepoMock.manager.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'invitation.accept_failed', outcome: 'failure' }),
        )
        expect(managerMock.update).not.toHaveBeenCalled()
        expect(managerMock.save).not.toHaveBeenCalled()
    })

    it('rejects with ConflictException when the identity already holds an active membership elsewhere', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture())
        managerMock.count.mockResolvedValue(1)

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow(ConflictException)
        expect(managerMock.update).not.toHaveBeenCalled()
    })

    it('returns the winning result without a second membership insert when two acceptances race', async () => {
        invitationRepoMock.findOne.mockResolvedValue(invitationFixture())
        managerMock.update.mockResolvedValue({ affected: 0 } as never)
        managerMock.findOneByOrFail.mockResolvedValue(
            invitationFixture({ status: 'accepted', role: 'member', email: 'invitee@example.test' }),
        )

        const result = await service.accept('the-raw-token', 'password12345')

        expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        expect(managerMock.save).not.toHaveBeenCalled()
        expect(managerMock.insert).not.toHaveBeenCalled()
    })
})
