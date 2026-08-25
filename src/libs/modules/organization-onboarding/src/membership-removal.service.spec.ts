import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    Organization,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'
import { MembershipRemovalService } from './membership-removal.service'

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
        role: 'member',
        status: 'active',
        ...overrides,
    } as OrganizationMembership
}

describe('MembershipRemovalService', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'findOne' | 'count' | 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let service: MembershipRemovalService

    beforeEach(() => {
        managerMock = { findOne: jest.fn(), count: jest.fn(), save: jest.fn(), insert: jest.fn() }
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture()),
        )
        managerMock.save.mockImplementation((entity, data) => Promise.resolve(data as never))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        service = new MembershipRemovalService(dataSourceMock as unknown as DataSource)
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member from removing anyone', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when the membership does not exist in this organization', async () => {
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(entity === Organization ? ({ id: 'org-1' } as Organization) : null),
        )

        await expect(service.remove(principalFixture(), 'org-1', 'missing')).rejects.toThrow(NotFoundException)
    })

    it('is an idempotent no-op when the membership is already disabled', async () => {
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(
                entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture({ status: 'disabled' }),
            ),
        )

        await service.remove(principalFixture(), 'org-1', 'membership-1')

        expect(managerMock.save).not.toHaveBeenCalled()
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('rejects an admin who tries to remove an owner', async () => {
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(
                entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture({ role: 'owner' }),
            ),
        )
        managerMock.count.mockResolvedValue(2)
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects removing the final active owner', async () => {
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(
                entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture({ role: 'owner' }),
            ),
        )
        managerMock.count.mockResolvedValue(1)

        await expect(service.remove(principalFixture(), 'org-1', 'membership-1')).rejects.toThrow(ConflictException)
    })

    it('allows removing an owner when another active owner exists, and writes an audit row', async () => {
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(
                entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture({ role: 'owner' }),
            ),
        )
        managerMock.count.mockResolvedValue(2)

        await service.remove(principalFixture(), 'org-1', 'membership-1')

        expect(managerMock.save).toHaveBeenCalledWith(
            OrganizationMembership,
            expect.objectContaining({ status: 'disabled' }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'membership.removed' }),
        )
    })

    it('allows an owner to remove a member without any Keycloak-adjacent dependency', async () => {
        await expect(service.remove(principalFixture(), 'org-1', 'membership-1')).resolves.toBeUndefined()
    })

    it('locks the organization before reloading the membership', async () => {
        await service.remove(principalFixture(), 'org-1', 'membership-1')

        expect(managerMock.findOne.mock.calls).toEqual([
            [Organization, { where: { id: 'org-1' }, lock: { mode: 'pessimistic_write' } }],
            [
                OrganizationMembership,
                {
                    where: { id: 'membership-1', organizationId: 'org-1' },
                },
            ],
        ])
    })
})
