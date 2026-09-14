import { EntityManager, In } from 'typeorm'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { TypeOrmVerificationResultCacheReader } from './typeorm-verification-result-cache-reader'

function manager(overrides: { findOne?: jest.Mock; intention?: unknown } = {}): EntityManager {
    const findOne =
        overrides.findOne ??
        jest.fn().mockResolvedValue({
            id: 'result-1',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: new Date(),
            evidencePolicyVersion: 1,
        })
    const findOneBy = jest.fn().mockResolvedValue(overrides.intention ?? null)
    return { findOne, findOneBy } as unknown as EntityManager
}

describe('TypeOrmVerificationResultCacheReader', () => {
    it('queries only settled conclusive qualities, newest first', async () => {
        const store = manager()
        const reader = new TypeOrmVerificationResultCacheReader(store)

        const candidate = await reader.findLatestCandidate('org-1', 'person@example.test')

        expect(candidate?.resultId).toBe('result-1')
        expect(store.findOne).toHaveBeenCalledWith(
            EmailVerificationEntity,
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: 'org-1',
                    email: 'person@example.test',
                    verificationQuality: In(['conclusive_positive', 'conclusive_negative']),
                }),
                order: { createdAt: 'DESC' },
            }),
        )
    })

    it('returns null when no candidate exists', async () => {
        const store = manager({ findOne: jest.fn().mockResolvedValue(null) })
        const reader = new TypeOrmVerificationResultCacheReader(store)
        await expect(reader.findLatestCandidate('org-1', 'person@example.test')).resolves.toBeNull()
    })

    it('hides a candidate whose settlement intention has not yet been confirmed', async () => {
        const store = manager({ intention: { executionId: 'execution-1', resultId: 'result-1', state: 'pending' } })
        const reader = new TypeOrmVerificationResultCacheReader(store)
        await expect(reader.findLatestCandidate('org-1', 'person@example.test')).resolves.toBeNull()
    })

    it('exposes a legacy candidate with no settlement intention at all', async () => {
        const store = manager()
        const reader = new TypeOrmVerificationResultCacheReader(store)
        await expect(reader.findLatestCandidate('org-1', 'person@example.test')).resolves.not.toBeNull()
        expect(store.findOneBy).toHaveBeenCalledWith(VerificationSettlementIntentionEntity, { resultId: 'result-1' })
    })

    describe('findLatestOutcome', () => {
        it('reports the latest outcome regardless of quality', async () => {
            const store = manager({
                findOne: jest.fn().mockResolvedValue({
                    id: 'result-1',
                    verificationQuality: 'inconclusive',
                    createdAt: new Date('2026-09-13T00:00:00.000Z'),
                }),
            })
            const reader = new TypeOrmVerificationResultCacheReader(store)

            await expect(reader.findLatestOutcome('org-1', 'person@example.test')).resolves.toEqual({
                verificationQuality: 'inconclusive',
                createdAt: new Date('2026-09-13T00:00:00.000Z'),
            })
            expect(store.findOne).toHaveBeenCalledWith(
                EmailVerificationEntity,
                expect.objectContaining({ where: { organizationId: 'org-1', email: 'person@example.test' } }),
            )
        })

        it('returns null when no outcome exists', async () => {
            const store = manager({ findOne: jest.fn().mockResolvedValue(null) })
            const reader = new TypeOrmVerificationResultCacheReader(store)
            await expect(reader.findLatestOutcome('org-1', 'person@example.test')).resolves.toBeNull()
        })

        it('hides an outcome whose settlement intention has not yet been confirmed', async () => {
            const store = manager({
                findOne: jest.fn().mockResolvedValue({
                    id: 'result-1',
                    verificationQuality: 'inconclusive',
                    createdAt: new Date(),
                }),
                intention: { executionId: 'execution-1', resultId: 'result-1', state: 'pending' },
            })
            const reader = new TypeOrmVerificationResultCacheReader(store)
            await expect(reader.findLatestOutcome('org-1', 'person@example.test')).resolves.toBeNull()
        })
    })
})
