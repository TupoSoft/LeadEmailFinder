import { DataSource } from 'typeorm'
import { OrganizationInvitation } from './organization-invitation.entity'
import { TypeOrmInvitationPreviewReader } from './typeorm-invitation-preview-reader'

describe('TypeOrmInvitationPreviewReader', () => {
    it('selects only one matching invitation display projection through its organization join', async () => {
        const row = { organizationName: 'Acme', email: 'invitee@example.test', role: 'member', status: 'pending', expiresAt: new Date('2000-01-01T00:00:00Z') }
        const query = {
            innerJoin: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue(row),
        }
        const manager = { createQueryBuilder: jest.fn().mockReturnValue(query) }
        const reader = new TypeOrmInvitationPreviewReader({ manager } as unknown as DataSource)
        expect(await reader.findByTokenHash('hashed-authority')).toEqual(row)
        expect(manager.createQueryBuilder).toHaveBeenCalledWith(OrganizationInvitation, 'invitation')
        expect(query.innerJoin).toHaveBeenCalledWith('invitation.organization', 'organization')
        expect(query.where).toHaveBeenCalledWith('invitation.tokenHash = :tokenHash', { tokenHash: 'hashed-authority' })
        expect(query.select.mock.calls).toEqual([['organization.name', 'organizationName']])
        expect(query.addSelect.mock.calls).toEqual([
            ['invitation.email', 'email'], ['invitation.role', 'role'],
            ['invitation.expiresAt', 'expiresAt'], ['invitation.status', 'status'],
        ])
    })
    it('returns undefined for unknown authority', async () => {
        const query = { innerJoin: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue(undefined) }
        const reader = new TypeOrmInvitationPreviewReader({ manager: { createQueryBuilder: () => query } } as unknown as DataSource)
        expect(await reader.findByTokenHash('unknown-hash')).toBeUndefined()
    })
})
