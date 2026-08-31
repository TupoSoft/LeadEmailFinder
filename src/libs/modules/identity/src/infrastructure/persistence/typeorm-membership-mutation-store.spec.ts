import { DataSource, EntityManager } from 'typeorm'
import { AuthPrincipal } from '../../domain/auth-principal'
import { OrganizationMembership } from './membership.entity'
import { Organization } from './organization.entity'
import { TypeOrmMembershipMutationStore } from './typeorm-membership-mutation-store'

function actorFixture(): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
    }
}

function membershipFixture(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
    return {
        id: 'membership-1',
        organizationId: 'org-1',
        externalIdentityId: 'ext-1',
        externalIdentity: { subject: 'kc-subject-1', email: 'member@example.test' },
        role: 'member',
        status: 'active',
        ...overrides,
    } as OrganizationMembership
}

describe('TypeOrmMembershipMutationStore', () => {
    let managerMock: jest.Mocked<
        Pick<EntityManager, 'findOne' | 'findOneOrFail' | 'findOneByOrFail' | 'count' | 'save' | 'insert'>
    >
    let queryRunnerMock: {
        connect: jest.Mock
        startTransaction: jest.Mock
        commitTransaction: jest.Mock
        rollbackTransaction: jest.Mock
        release: jest.Mock
        manager: typeof managerMock
    }
    let dataSourceMock: { createQueryRunner: jest.Mock }
    let store: TypeOrmMembershipMutationStore

    beforeEach(() => {
        managerMock = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            findOneByOrFail: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            save: jest.fn(),
            insert: jest.fn(),
        }
        managerMock.findOne.mockImplementation(entity =>
            Promise.resolve(entity === Organization ? ({ id: 'org-1' } as Organization) : membershipFixture()),
        )
        managerMock.findOneOrFail.mockResolvedValue(membershipFixture())
        managerMock.findOneByOrFail.mockResolvedValue(membershipFixture())
        managerMock.save.mockImplementation((_entity, data) => Promise.resolve(data as never))
        queryRunnerMock = {
            connect: jest.fn().mockResolvedValue(undefined),
            startTransaction: jest.fn().mockResolvedValue(undefined),
            commitTransaction: jest.fn().mockResolvedValue(undefined),
            rollbackTransaction: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            manager: managerMock,
        }
        dataSourceMock = { createQueryRunner: jest.fn().mockReturnValue(queryRunnerMock) }
        store = new TypeOrmMembershipMutationStore(dataSourceMock as unknown as DataSource)
    })

    describe('begin', () => {
        it('locks the organization and returns a ready session with the membership and active-owner count', async () => {
            managerMock.count.mockResolvedValue(2)

            const outcome = await store.begin('org-1', 'membership-1')

            expect(queryRunnerMock.connect).toHaveBeenCalled()
            expect(managerMock.findOne).toHaveBeenCalledWith(Organization, {
                where: { id: 'org-1' },
                lock: { mode: 'pessimistic_write' },
            })
            if (outcome.kind !== 'ready') throw new Error('expected ready')
            expect(outcome.context.activeOwnerCount).toBe(2)
            expect(outcome.context.membership).toEqual(
                expect.objectContaining({ id: 'membership-1', externalIdentitySubject: 'kc-subject-1' }),
            )
        })

        it('returns not-found and rolls back when the membership does not exist in this organization', async () => {
            managerMock.findOne.mockImplementation(entity =>
                Promise.resolve(entity === Organization ? ({ id: 'org-1' } as Organization) : null),
            )

            const outcome = await store.begin('org-1', 'missing')

            expect(outcome).toEqual({ kind: 'not-found' })
            expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
        })
    })

    describe('session.changeRole', () => {
        it('saves the new role and writes an audit row, then commits', async () => {
            const outcome = await store.begin('org-1', 'membership-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            const result = await outcome.session.changeRole('admin', actorFixture())

            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationMembership,
                expect.objectContaining({ role: 'admin' }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    action: 'membership.role_changed',
                    metadata: { fromRole: 'member', toRole: 'admin' },
                }),
            )
            expect(queryRunnerMock.commitTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
            expect(result.role).toBe('admin')
        })
    })

    describe('session.disable', () => {
        it('marks the membership disabled and writes an audit row, then commits', async () => {
            const outcome = await store.begin('org-1', 'membership-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            await outcome.session.disable(actorFixture())

            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationMembership,
                expect.objectContaining({ status: 'disabled' }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ action: 'membership.removed' }),
            )
            expect(queryRunnerMock.commitTransaction).toHaveBeenCalled()
        })
    })

    describe('session.abort', () => {
        it('rolls back and releases without writing', async () => {
            const outcome = await store.begin('org-1', 'membership-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            await outcome.session.abort()

            expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('is a no-op after changeRole() has already settled', async () => {
            const outcome = await store.begin('org-1', 'membership-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            await outcome.session.changeRole('admin', actorFixture())
            queryRunnerMock.rollbackTransaction.mockClear()
            await outcome.session.abort()

            expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled()
        })
    })
})
