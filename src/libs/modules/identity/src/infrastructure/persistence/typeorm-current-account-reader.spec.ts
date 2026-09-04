import { Repository, SelectQueryBuilder } from 'typeorm'
import { OrganizationMembership } from './membership.entity'
import { TypeOrmCurrentAccountReader } from './typeorm-current-account-reader'

type QueryBuilderMock = jest.Mocked<
    Pick<
        SelectQueryBuilder<OrganizationMembership>,
        'innerJoin' | 'select' | 'addSelect' | 'where' | 'andWhere' | 'take' | 'getRawMany'
    >
>

describe('TypeOrmCurrentAccountReader', () => {
    let membershipRepoMock: jest.Mocked<Pick<Repository<OrganizationMembership>, 'createQueryBuilder'>>
    let queryBuilderMock: QueryBuilderMock
    let reader: TypeOrmCurrentAccountReader

    beforeEach(() => {
        queryBuilderMock = {
            innerJoin: jest.fn(),
            select: jest.fn(),
            addSelect: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            take: jest.fn(),
            getRawMany: jest.fn(),
        }
        queryBuilderMock.innerJoin.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )
        queryBuilderMock.select.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )
        queryBuilderMock.addSelect.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )
        queryBuilderMock.where.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )
        queryBuilderMock.andWhere.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )
        queryBuilderMock.take.mockReturnValue(
            queryBuilderMock as unknown as SelectQueryBuilder<OrganizationMembership>,
        )

        membershipRepoMock = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
        }
        reader = new TypeOrmCurrentAccountReader(
            membershipRepoMock as unknown as Repository<OrganizationMembership>,
        )
    })

    it('selects only the browser account fields for active memberships and returns the single matching account', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([
            {
                email: 'owner@example.test',
                membershipId: 'membership-1',
                membershipRole: 'owner',
                organizationId: 'organization-1',
                organizationName: 'Example Organization',
            },
        ])

        const result = await reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' })

        expect(membershipRepoMock.createQueryBuilder).toHaveBeenCalledWith('membership')
        expect(queryBuilderMock.innerJoin).toHaveBeenNthCalledWith(
            1,
            'membership.externalIdentity',
            'externalIdentity',
        )
        expect(queryBuilderMock.innerJoin).toHaveBeenNthCalledWith(2, 'membership.organization', 'organization')
        expect(queryBuilderMock.select).toHaveBeenCalledWith('externalIdentity.email', 'email')
        expect(queryBuilderMock.addSelect.mock.calls).toEqual([
            ['membership.id', 'membershipId'],
            ['membership.role', 'membershipRole'],
            ['organization.id', 'organizationId'],
            ['organization.name', 'organizationName'],
        ])
        expect(queryBuilderMock.where).toHaveBeenCalledWith(
            'membership.externalIdentityId = :externalIdentityId',
            { externalIdentityId: 'identity-1' },
        )
        expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('membership.status = :status', { status: 'active' })
        expect(queryBuilderMock.take).toHaveBeenCalledWith(2)
        expect(result).toEqual({
            email: 'owner@example.test',
            membership: { id: 'membership-1', role: 'owner' },
            organization: { id: 'organization-1', name: 'Example Organization' },
        })
    })

    it('preserves a null external-identity email', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([
            {
                email: null,
                membershipId: 'membership-1',
                membershipRole: 'member',
                organizationId: 'organization-1',
                organizationName: 'Example Organization',
            },
        ])

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).resolves.toEqual(expect.objectContaining({ email: null }))
    })

    it('returns undefined when no membership exists', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([])

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).resolves.toBeUndefined()
    })

    it('returns undefined for a disabled membership because the query admits only active rows', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([])

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).resolves.toBeUndefined()
        expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('membership.status = :status', { status: 'active' })
    })

    it('returns undefined when more than one active membership exists', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([
            {
                email: 'member@example.test',
                membershipId: 'membership-1',
                membershipRole: 'member',
                organizationId: 'organization-1',
                organizationName: 'First Organization',
            },
            {
                email: 'member@example.test',
                membershipId: 'membership-2',
                membershipRole: 'member',
                organizationId: 'organization-2',
                organizationName: 'Second Organization',
            },
        ])

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).resolves.toBeUndefined()
    })

    it('returns undefined when the active membership belongs to a different organization', async () => {
        queryBuilderMock.getRawMany.mockResolvedValueOnce([
            {
                email: 'member@example.test',
                membershipId: 'membership-1',
                membershipRole: 'member',
                organizationId: 'organization-2',
                organizationName: 'Different Organization',
            },
        ])

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).resolves.toBeUndefined()
    })

    it('propagates unexpected repository failures', async () => {
        const outage = new Error('database unavailable')
        queryBuilderMock.getRawMany.mockRejectedValueOnce(outage)

        await expect(
            reader.read({ externalIdentityId: 'identity-1', organizationId: 'organization-1' }),
        ).rejects.toBe(outage)
    })
})
