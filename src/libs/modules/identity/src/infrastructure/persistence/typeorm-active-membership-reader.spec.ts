import { Repository } from 'typeorm'
import { OrganizationMembership } from './membership.entity'
import { TypeOrmActiveMembershipReader } from './typeorm-active-membership-reader'

describe('TypeOrmActiveMembershipReader', () => {
    let repoMock: jest.Mocked<Pick<Repository<OrganizationMembership>, 'findOne' | 'find'>>
    let reader: TypeOrmActiveMembershipReader

    beforeEach(() => {
        repoMock = { findOne: jest.fn(), find: jest.fn() }
        reader = new TypeOrmActiveMembershipReader(repoMock as unknown as Repository<OrganizationMembership>)
    })

    const membership: OrganizationMembership = {
        id: 'm-1',
        organizationId: 'org-1',
        externalIdentityId: 'ext-1',
        role: 'member',
        status: 'active',
    } as OrganizationMembership

    describe('findByOrganizationAndExternalIdentity', () => {
        it('queries by exactly organizationId and externalIdentityId, with no status filter', async () => {
            repoMock.findOne.mockResolvedValueOnce(membership)

            const result = await reader.findByOrganizationAndExternalIdentity('org-1', 'ext-1')

            expect(repoMock.findOne).toHaveBeenCalledWith({ where: { organizationId: 'org-1', externalIdentityId: 'ext-1' } })
            expect(result).toEqual({ id: 'm-1', organizationId: 'org-1', externalIdentityId: 'ext-1', role: 'member', status: 'active' })
        })

        it('returns a disabled membership as-is, without filtering it out', async () => {
            const disabled = { ...membership, status: 'disabled' } as OrganizationMembership
            repoMock.findOne.mockResolvedValueOnce(disabled)

            const result = await reader.findByOrganizationAndExternalIdentity('org-1', 'ext-1')

            expect(result?.status).toBe('disabled')
        })

        it('returns undefined when not found', async () => {
            repoMock.findOne.mockResolvedValueOnce(null)

            await expect(reader.findByOrganizationAndExternalIdentity('org-1', 'ext-1')).resolves.toBeUndefined()
        })
    })

    describe('findActiveForExternalIdentity', () => {
        it('queries with an active-status filter and maps every result', async () => {
            repoMock.find.mockResolvedValueOnce([membership])

            const result = await reader.findActiveForExternalIdentity('ext-1')

            expect(repoMock.find).toHaveBeenCalledWith({ where: { externalIdentityId: 'ext-1', status: 'active' } })
            expect(result).toEqual([{ id: 'm-1', organizationId: 'org-1', externalIdentityId: 'ext-1', role: 'member', status: 'active' }])
        })

        it('returns an empty array when there are no active memberships', async () => {
            repoMock.find.mockResolvedValueOnce([])

            await expect(reader.findActiveForExternalIdentity('ext-1')).resolves.toEqual([])
        })
    })
})
