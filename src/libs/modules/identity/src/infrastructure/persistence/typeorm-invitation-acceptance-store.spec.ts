import { DataSource, EntityManager, Repository } from 'typeorm'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { ExternalIdentity } from './external-identity.entity'
import { OrganizationInvitation } from './organization-invitation.entity'
import { TypeOrmInvitationAcceptanceStore } from './typeorm-invitation-acceptance-store'

const issuer = 'https://issuer'

function invitationFixture(overrides: Partial<OrganizationInvitationRecord> = {}): OrganizationInvitationRecord {
    return {
        id: 'invitation-1',
        organizationId: 'org-1',
        email: 'invitee@example.test',
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    }
}

describe('TypeOrmInvitationAcceptanceStore', () => {
    let externalIdentityRepoMock: jest.Mocked<Pick<Repository<ExternalIdentity>, 'findOne' | 'save' | 'create'>>
    let managerMock: jest.Mocked<
        Pick<EntityManager, 'getRepository' | 'findOne' | 'findOneByOrFail' | 'count' | 'update' | 'save' | 'create' | 'insert'>
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
    let store: TypeOrmInvitationAcceptanceStore

    beforeEach(() => {
        externalIdentityRepoMock = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() }
        externalIdentityRepoMock.create.mockImplementation(data => data as ExternalIdentity)
        managerMock = {
            getRepository: jest.fn().mockReturnValue(externalIdentityRepoMock),
            findOne: jest.fn(),
            findOneByOrFail: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            save: jest.fn(),
            create: jest.fn(),
            insert: jest.fn(),
        }
        managerMock.create.mockImplementation((_entity, data) => data as never)
        managerMock.save.mockImplementation((_entity: unknown, data: any) => Promise.resolve({ id: 'membership-1', ...data }))
        queryRunnerMock = {
            connect: jest.fn().mockResolvedValue(undefined),
            startTransaction: jest.fn().mockResolvedValue(undefined),
            commitTransaction: jest.fn().mockResolvedValue(undefined),
            rollbackTransaction: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            manager: managerMock,
        }
        dataSourceMock = { createQueryRunner: jest.fn().mockReturnValue(queryRunnerMock) }
        store = new TypeOrmInvitationAcceptanceStore(dataSourceMock as unknown as DataSource)

        externalIdentityRepoMock.findOne.mockResolvedValue({
            id: 'external-identity-1',
            issuer,
            subject: 'keycloak-subject-1',
            email: 'invitee@example.test',
        } as ExternalIdentity)
        managerMock.findOneByOrFail.mockResolvedValue(
            invitationFixture() as unknown as OrganizationInvitation,
        )
    })

    describe('begin', () => {
        it('resolves the existing identity, locks it, and returns a ready session', async () => {
            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')

            expect(queryRunnerMock.connect).toHaveBeenCalled()
            expect(queryRunnerMock.startTransaction).toHaveBeenCalled()
            expect(managerMock.findOne).toHaveBeenCalledWith(ExternalIdentity, {
                where: { id: 'external-identity-1' },
                lock: { mode: 'pessimistic_write' },
            })
            expect(outcome.kind).toBe('ready')
            expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled()
            expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled()
        })

        it('creates a new external identity when none exists', async () => {
            externalIdentityRepoMock.findOne.mockResolvedValue(null)
            externalIdentityRepoMock.save.mockResolvedValue({ id: 'new-identity-1' } as ExternalIdentity)

            await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')

            expect(externalIdentityRepoMock.create).toHaveBeenCalledWith({
                issuer,
                subject: 'keycloak-subject-1',
                email: 'invitee@example.test',
            })
            expect(externalIdentityRepoMock.save).toHaveBeenCalled()
        })

        it('recovers from a unique-violation race by re-reading the identity another connection just created', async () => {
            externalIdentityRepoMock.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 'raced-identity-1' } as ExternalIdentity)
            externalIdentityRepoMock.save.mockRejectedValue({ code: '23505' })

            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')

            expect(outcome.kind).toBe('ready')
        })

        it('returns already-accepted and commits when a concurrent acceptance already won', async () => {
            managerMock.findOneByOrFail.mockResolvedValue(
                invitationFixture({ status: 'accepted', role: 'admin' }) as unknown as OrganizationInvitation,
            )

            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')

            expect(outcome).toEqual({
                kind: 'already-accepted',
                result: { organizationId: 'org-1', role: 'admin', email: 'invitee@example.test' },
            })
            expect(queryRunnerMock.commitTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
        })

        it('returns conflicting-membership and rolls back when the identity already holds an active membership', async () => {
            managerMock.count.mockResolvedValue(1)

            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')

            expect(outcome).toEqual({ kind: 'conflicting-membership' })
            expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
        })

        it('rolls back and releases when an unexpected error occurs', async () => {
            managerMock.findOneByOrFail.mockRejectedValue(new Error('boom'))

            await expect(store.begin(invitationFixture(), issuer, 'keycloak-subject-1')).rejects.toThrow('boom')

            expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
        })
    })

    describe('session', () => {
        it('complete() marks the invitation accepted, creates the membership, and audits', async () => {
            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            const result = await outcome.session.complete()

            expect(managerMock.update).toHaveBeenCalledWith(
                OrganizationInvitation,
                { id: 'invitation-1', status: 'pending' },
                expect.objectContaining({ status: 'accepted', acceptedByExternalIdentityId: 'external-identity-1' }),
            )
            expect(managerMock.save).toHaveBeenCalled()
            expect(managerMock.insert).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ action: 'invitation.accepted' }),
            )
            expect(queryRunnerMock.commitTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
            expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        })

        it('complete() returns the winning racer without a second write when the conditional update loses', async () => {
            managerMock.update.mockResolvedValue({ affected: 0 } as never)
            managerMock.findOneByOrFail
                .mockResolvedValueOnce(invitationFixture() as unknown as OrganizationInvitation)
                .mockResolvedValueOnce(
                    invitationFixture({ status: 'accepted', role: 'member' }) as unknown as OrganizationInvitation,
                )

            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            const result = await outcome.session.complete()

            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(queryRunnerMock.commitTransaction).toHaveBeenCalled()
            expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        })

        it('abort() rolls back and releases without writing', async () => {
            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            await outcome.session.abort()

            expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled()
            expect(queryRunnerMock.release).toHaveBeenCalled()
            expect(managerMock.update).not.toHaveBeenCalled()
        })

        it('abort() is a no-op after complete() has already settled', async () => {
            const outcome = await store.begin(invitationFixture(), issuer, 'keycloak-subject-1')
            if (outcome.kind !== 'ready') throw new Error('expected ready')

            await outcome.session.complete()
            queryRunnerMock.rollbackTransaction.mockClear()
            await outcome.session.abort()

            expect(queryRunnerMock.rollbackTransaction).not.toHaveBeenCalled()
        })
    })
})
