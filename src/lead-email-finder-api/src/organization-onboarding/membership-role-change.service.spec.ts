import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ExternalIdentity, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
import { KeycloakOrganizationAdmin } from './keycloak-organization-admin'
import { MembershipRoleChangeService } from './membership-role-change.service'

function principalFixture(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

function membershipFixture(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
    return {
        id: 'membership-1',
        organizationId: 'org-1',
        externalIdentityId: 'target-identity-1',
        externalIdentity: { subject: 'target-subject-1' } as ExternalIdentity,
        role: 'member',
        status: 'active',
        ...overrides,
    } as OrganizationMembership
}

describe('MembershipRoleChangeService', () => {
    let membershipRepoMock: jest.Mocked<Pick<Repository<OrganizationMembership>, 'findOne' | 'count'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let keycloakAdminMock: jest.Mocked<KeycloakOrganizationAdmin>
    let service: MembershipRoleChangeService

    beforeEach(() => {
        membershipRepoMock = { findOne: jest.fn(), count: jest.fn() }
        managerMock = { save: jest.fn(), insert: jest.fn() }
        managerMock.save.mockImplementation((entity, data) => Promise.resolve(data as never))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        keycloakAdminMock = { ensureUser: jest.fn(), assignRealmRole: jest.fn() }
        service = new MembershipRoleChangeService(
            membershipRepoMock as unknown as Repository<OrganizationMembership>,
            dataSourceMock as unknown as DataSource,
            keycloakAdminMock,
        )
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member from changing roles', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when the membership does not exist in this organization', async () => {
        membershipRepoMock.findOne.mockResolvedValue(null)

        await expect(service.changeRole(principalFixture(), 'org-1', 'missing', 'admin')).rejects.toThrow(
            NotFoundException,
        )
    })

    it('rejects an admin who tries to grant the owner role', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'member' }))
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'owner')).rejects.toThrow(ForbiddenException)
    })

    it('rejects an admin who tries to modify an existing owner', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'owner' }))
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(ForbiddenException)
    })

    it('rejects demoting the final active owner', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'owner' }))
        membershipRepoMock.count.mockResolvedValue(1)

        await expect(service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            ConflictException,
        )
    })

    it('allows demoting an owner when another active owner exists', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'owner' }))
        membershipRepoMock.count.mockResolvedValue(2)

        const result = await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')

        expect(result.role).toBe('admin')
    })

    it('assigns the Keycloak realm role on promotion but not otherwise', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'member' }))

        await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')

        expect(keycloakAdminMock.assignRealmRole).toHaveBeenCalledWith('target-subject-1', 'admin')
    })

    it('does not call Keycloak when demoting to member', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'admin' }))
        membershipRepoMock.count.mockResolvedValue(0)

        await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'member')

        expect(keycloakAdminMock.assignRealmRole).not.toHaveBeenCalled()
    })

    it('writes an audit row recording the role transition', async () => {
        membershipRepoMock.findOne.mockResolvedValue(membershipFixture({ role: 'member' }))

        await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')

        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'membership.role_changed', metadata: { fromRole: 'member', toRole: 'admin' } }),
        )
    })
})
