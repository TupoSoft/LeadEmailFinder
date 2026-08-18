import { ForbiddenException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, OrganizationInvitation } from '@tuposoft/lead-email-finder/modules/identity'
import { InvitationIssuanceService } from './invitation-issuance.service'

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

describe('InvitationIssuanceService', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'create' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let service: InvitationIssuanceService

    beforeEach(() => {
        managerMock = { save: jest.fn(), create: jest.fn(), insert: jest.fn() }
        managerMock.create.mockImplementation((entity, data) => data as never)
        managerMock.save.mockImplementation((entity: any, data: any) => Promise.resolve({ id: 'invitation-1', ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        service = new InvitationIssuanceService(dataSourceMock as unknown as DataSource)
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'member')).rejects.toThrow(ForbiddenException)
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('rejects a member (non owner/admin) from issuing an invitation', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'member')).rejects.toThrow(ForbiddenException)
    })

    it('rejects an admin who tries to grant the owner role', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'owner')).rejects.toThrow(ForbiddenException)
    })

    it('allows an admin to invite a member or another admin', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'admin')).resolves.toBeDefined()
    })

    it('allows an owner to invite an owner, admin, or member and writes an audit row', async () => {
        const actor = principalFixture({ membershipRole: 'owner' })

        const result = await service.issue(actor, 'org-1', 'New@Example.test', 'owner')

        expect(result.rawToken).toEqual(expect.any(String))
        expect(managerMock.create).toHaveBeenCalledWith(
            OrganizationInvitation,
            expect.objectContaining({ organizationId: 'org-1', email: 'new@example.test', role: 'owner' }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'invitation.issued', organizationId: 'org-1' }),
        )
    })
})
