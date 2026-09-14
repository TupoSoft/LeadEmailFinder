import { DataSource, EntityManager } from 'typeorm'
import { PersistResultInput } from '../../application/ports/verification-settlement-store'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { TypeOrmVerificationSettlementStore } from './typeorm-verification-settlement.store'

const organizationId = '10000000-0000-4000-8000-000000000001'

function execution(overrides: Partial<VerificationExecutionEntity> = {}): VerificationExecutionEntity {
    return {
        executionId: 'execution-1',
        organizationId,
        normalizedAddress: 'person@example.test',
        payerRequestId: 'request-1',
        state: 'running',
        fundingOwnerType: 'single',
        fundingOwnerId: 'execution-1',
        attemptGeneration: 0,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as VerificationExecutionEntity
}

function persistInput(overrides: Partial<PersistResultInput> = {}): PersistResultInput {
    return {
        executionId: 'execution-1',
        organizationId,
        expectedGeneration: 0,
        newVerification: {
            email: 'person@example.test',
            domain: 'example.test',
            localPart: 'person',
            exists: true,
            catchAll: false,
            reason: 'accepted_email',
            sources: [],
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: new Date(),
            evidencePolicyVersion: 1,
        } as unknown as PersistResultInput['newVerification'],
        decision: 'capture',
        finalReason: 'conclusive',
        ...overrides,
    }
}

describe('TypeOrmVerificationSettlementStore', () => {
    let manager: {
        findOne: jest.Mock
        findOneOrFail: jest.Mock
        findOneBy: jest.Mock
        findOneByOrFail: jest.Mock
        find: jest.Mock
        create: jest.Mock
        save: jest.Mock
    }
    let store: TypeOrmVerificationSettlementStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            findOneBy: jest.fn(),
            findOneByOrFail: jest.fn().mockResolvedValue({ id: 'result-1', exists: true }),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((_entityClass: unknown, value: unknown) => value),
            save: jest.fn((_entityClass: unknown, value: object) => {
                if (_entityClass === EmailVerificationEntity) return Promise.resolve({ ...value, id: 'result-1' })
                return Promise.resolve(value)
            }),
        }
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmVerificationSettlementStore({
            transaction,
            manager: manager as unknown as EntityManager,
        } as unknown as DataSource)
    })

    describe('persistResultAndIntention', () => {
        it('persists the result and its intention together, moving the execution to settling', async () => {
            manager.findOneOrFail.mockResolvedValue(execution())
            manager.findOneBy.mockResolvedValue(null)
            const outcome = await store.persistResultAndIntention(persistInput())
            expect(outcome.kind).toBe('persisted')
            expect(manager.save).toHaveBeenCalledWith(
                VerificationExecutionEntity,
                expect.objectContaining({ state: 'settling', resultId: 'result-1' }),
            )
        })

        it('replays the existing intention without a second insert', async () => {
            manager.findOneOrFail.mockResolvedValue(execution())
            manager.findOneBy.mockResolvedValue({
                executionId: 'execution-1',
                organizationId,
                decision: 'capture',
                resultId: 'result-1',
                state: 'pending',
                createdAt: new Date(),
                confirmedAt: null,
            })
            const outcome = await store.persistResultAndIntention(persistInput())
            expect(outcome).toEqual(expect.objectContaining({ kind: 'already-persisted', resultId: 'result-1' }))
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('rejects a stale generation without mutation', async () => {
            manager.findOneOrFail.mockResolvedValue(execution({ attemptGeneration: 3 }))
            manager.findOneBy.mockResolvedValue(null)
            const outcome = await store.persistResultAndIntention(persistInput({ expectedGeneration: 1 }))
            expect(outcome).toEqual({ kind: 'stale-generation' })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('rejects a terminal execution without mutation', async () => {
            manager.findOneOrFail.mockResolvedValue(execution({ state: 'completed' }))
            manager.findOneBy.mockResolvedValue(null)
            const outcome = await store.persistResultAndIntention(persistInput())
            expect(outcome).toEqual({ kind: 'terminal' })
            expect(manager.save).not.toHaveBeenCalled()
        })
    })

    describe('confirmSettlement', () => {
        it('flips the execution and every linked request terminal, recording capture billing', async () => {
            manager.findOneOrFail.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationSettlementIntentionEntity) {
                    return Promise.resolve({
                        executionId: 'execution-1',
                        organizationId,
                        decision: 'capture',
                        resultId: 'result-1',
                        state: 'pending',
                        createdAt: new Date(),
                        confirmedAt: null,
                    })
                }
                return Promise.resolve(execution({ state: 'settling', payerRequestId: 'request-1' }))
            })
            manager.find.mockResolvedValue([
                { requestId: 'request-1', reservedCount: 1, chargedCount: 0, billingState: 'pending' },
                { requestId: 'request-2', reservedCount: 0, chargedCount: 0, billingState: 'pending' },
            ])

            const result = await store.confirmSettlement('execution-1', organizationId)
            expect(result).toEqual({ resultId: 'result-1', normalizedAddress: 'person@example.test', exists: true })
            const savedRequests = (
                manager.save.mock.calls.find(([entityClass]) => entityClass === VerificationRequestEntity) as
                    | [unknown, unknown]
                    | undefined
            )?.[1]
            expect(savedRequests).toEqual([
                expect.objectContaining({ requestId: 'request-1', finalReason: 'conclusive', chargedCount: 1, billingState: 'settled' }),
                expect.objectContaining({ requestId: 'request-2', finalReason: 'shared', chargedCount: 0, billingState: 'settled' }),
            ])
        })

        it('records zero charge for a release decision', async () => {
            manager.findOneOrFail.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationSettlementIntentionEntity) {
                    return Promise.resolve({
                        executionId: 'execution-1',
                        organizationId,
                        decision: 'release',
                        resultId: 'result-1',
                        state: 'pending',
                        createdAt: new Date(),
                        confirmedAt: null,
                    })
                }
                return Promise.resolve(execution({ state: 'settling', payerRequestId: 'request-1' }))
            })
            manager.find.mockResolvedValue([{ requestId: 'request-1', reservedCount: 1, chargedCount: 0 }])

            await store.confirmSettlement('execution-1', organizationId)
            const savedRequests = (
                manager.save.mock.calls.find(([entityClass]) => entityClass === VerificationRequestEntity) as
                    | [unknown, unknown]
                    | undefined
            )?.[1]
            expect(savedRequests).toEqual([expect.objectContaining({ finalReason: 'inconclusive', chargedCount: 0 })])
        })

        it('replays an already-confirmed intention without mutating anything again', async () => {
            manager.findOneOrFail.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationSettlementIntentionEntity) {
                    return Promise.resolve({
                        executionId: 'execution-1',
                        organizationId,
                        decision: 'capture',
                        resultId: 'result-1',
                        state: 'confirmed',
                        createdAt: new Date(),
                        confirmedAt: new Date(),
                    })
                }
                return Promise.resolve(execution({ state: 'completed', normalizedAddress: 'person@example.test' }))
            })
            const result = await store.confirmSettlement('execution-1', organizationId)
            expect(result).toEqual({ resultId: 'result-1', normalizedAddress: 'person@example.test', exists: true })
            expect(manager.save).not.toHaveBeenCalled()
            expect(manager.find).not.toHaveBeenCalled()
        })
    })

    it('finds an intention by execution and organization', async () => {
        manager.findOneBy.mockResolvedValue({
            executionId: 'execution-1',
            organizationId,
            decision: 'capture',
            resultId: 'result-1',
            state: 'pending',
            createdAt: new Date(),
            confirmedAt: null,
        })
        const intention = await store.findIntention('execution-1', organizationId)
        expect(intention?.resultId).toBe('result-1')
    })

    it('pages pending intentions oldest first', async () => {
        manager.find.mockResolvedValue([])
        await store.pagePendingIntentions(100)
        expect(manager.find).toHaveBeenCalledWith(
            VerificationSettlementIntentionEntity,
            expect.objectContaining({ where: { state: 'pending' } }),
        )
    })
})
