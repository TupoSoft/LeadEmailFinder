import { EntityManager, In } from 'typeorm'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { TypeOrmVerificationResultCacheReader } from './typeorm-verification-result-cache-reader'

describe('TypeOrmVerificationResultCacheReader', () => {
    it('queries only settled conclusive qualities, newest first', async () => {
        const findOne = jest.fn().mockResolvedValue({
            id: 'result-1',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: new Date(),
            evidencePolicyVersion: 1,
        })
        const reader = new TypeOrmVerificationResultCacheReader({ findOne } as unknown as EntityManager)

        const candidate = await reader.findLatestCandidate('org-1', 'person@example.test')

        expect(candidate?.resultId).toBe('result-1')
        expect(findOne).toHaveBeenCalledWith(
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
        const findOne = jest.fn().mockResolvedValue(null)
        const reader = new TypeOrmVerificationResultCacheReader({ findOne } as unknown as EntityManager)
        await expect(reader.findLatestCandidate('org-1', 'person@example.test')).resolves.toBeNull()
    })
})
