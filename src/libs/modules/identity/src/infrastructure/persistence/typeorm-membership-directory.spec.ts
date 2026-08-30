import { DataSource, EntityManager } from 'typeorm'
import { OrganizationMembership } from './membership.entity'
import { TypeOrmMembershipDirectory } from './typeorm-membership-directory'

describe('TypeOrmMembershipDirectory', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'find'>>
    let dataSourceMock: { manager: typeof managerMock }
    let directory: TypeOrmMembershipDirectory

    beforeEach(() => {
        managerMock = { find: jest.fn() }
        dataSourceMock = { manager: managerMock }
        directory = new TypeOrmMembershipDirectory(dataSourceMock as unknown as DataSource)
    })

    it('lists every membership for the organization regardless of status', async () => {
        managerMock.find.mockResolvedValue([
            {
                id: 'membership-1',
                organizationId: 'org-1',
                externalIdentityId: 'ext-1',
                externalIdentity: { subject: 'kc-subject-1', email: 'member@example.test' },
                role: 'member',
                status: 'disabled',
            } as OrganizationMembership,
        ])

        const result = await directory.listForOrganization('org-1')

        expect(managerMock.find).toHaveBeenCalledWith(OrganizationMembership, {
            where: { organizationId: 'org-1' },
            relations: ['externalIdentity'],
        })
        expect(result).toEqual([
            {
                id: 'membership-1',
                organizationId: 'org-1',
                externalIdentityId: 'ext-1',
                externalIdentitySubject: 'kc-subject-1',
                email: 'member@example.test',
                role: 'member',
                status: 'disabled',
            },
        ])
    })
})
