import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { mapAsyncVerificationStatus } from '../application/delivery/async/async-verification-status'
import { EmailVerificationEntity } from './persistence/typeorm/email-verification.entity'
import { VerificationSettlementIntentionEntity } from './persistence/typeorm/verification-settlement-intention.entity'
import { TypeOrmVerificationResultReader } from './typeorm-verification-result-reader'

describe('TypeOrmVerificationResultReader', () => {
    const lookup = {
        id: '00000000-0000-4000-8000-000000000001',
        organizationId: '00000000-0000-4000-8000-000000000002',
    }

    function manager(overrides: { result?: unknown; intention?: unknown } = {}): { findOneBy: jest.Mock } {
        const findOneBy = jest.fn((entityClass: unknown) => {
            if (entityClass === EmailVerificationEntity) return Promise.resolve(overrides.result ?? null)
            if (entityClass === VerificationSettlementIntentionEntity) return Promise.resolve(overrides.intention ?? null)
            throw new Error('unexpected entity class')
        })
        return { findOneBy }
    }

    it('reports not-found when no row matches identity and ownership', async () => {
        const store = manager()
        const reader = new TypeOrmVerificationResultReader(store)

        await expect(reader.findOwned(lookup)).resolves.toBeNull()
        expect(store.findOneBy).toHaveBeenCalledWith(EmailVerificationEntity, lookup)
    })

    it('exposes the current result contract, including evidence observation time, once settlement is confirmed', async () => {
        const observedAt = new Date('2025-12-31T00:00:00.000Z')
        const result = {
            id: lookup.id,
            email: 'person@example.test',
            localPart: 'person',
            domain: 'example.test',
            format: EmailPatternEnum.First,
            mxDomain: 'mx.example.test',
            targetExchange: 'mx.example.test',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            evidenceObservedAt: observedAt,
        }
        const store = manager({
            result: {
                ...result,
                organizationId: lookup.organizationId,
                batchId: '00000000-0000-4000-8000-000000000003',
                futurePrivateColumn: 'private',
            },
            intention: { executionId: 'execution-1', resultId: lookup.id, state: 'confirmed' },
        })

        const response = await new TypeOrmVerificationResultReader(store).findOwned(lookup)

        expect(response).toEqual(result)
        expect(response).not.toHaveProperty('organizationId')
        expect(response).not.toHaveProperty('batchId')
        expect(response).not.toHaveProperty('futurePrivateColumn')
    })

    it('omits SQL-null optional strings from async results while preserving nullable evidence', async () => {
        const createdAt = new Date('2026-01-01T00:00:00.000Z')
        const store = manager({
            result: {
                ...baseResult(),
                format: null,
                mxDomain: null,
                targetExchange: null,
                exists: null,
                catchAll: null,
                evidenceObservedAt: null,
            },
            intention: { executionId: 'execution-1', resultId: lookup.id, state: 'confirmed' },
        })

        const result = await new TypeOrmVerificationResultReader(store).findOwned(lookup)

        expect(result).toMatchObject({
            format: undefined,
            mxDomain: undefined,
            targetExchange: undefined,
            exists: null,
            catchAll: null,
            evidenceObservedAt: null,
        })
        const status = mapAsyncVerificationStatus({
            kind: 'settled',
            request: {
                requestId: '00000000-0000-4000-8000-000000000003',
                organizationId: lookup.organizationId,
                normalizedAddress: 'person@example.test',
                deliveryMode: 'async',
                clientRequestKey: null,
                executionId: 'execution-1',
                resultId: lookup.id,
                source: 'fresh',
                billingState: 'settled',
                reservedCount: 1,
                chargedCount: 0,
                finalReason: 'inconclusive',
                createdAt,
                settledAt: createdAt,
            },
            result,
        }, 24 * 60 * 60 * 1000)

        expect(status).toMatchObject({
            state: 'completed',
            operation: { observedAt: null, cacheExpiresAt: null },
        })
        expect('result' in status ? status.result : undefined).toEqual({
            id: lookup.id,
            email: 'person@example.test',
            localPart: 'person',
            domain: 'example.test',
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
        })
    })

    it('hides a result whose settlement intention has not yet been confirmed', async () => {
        const store = manager({
            result: { ...baseResult(), organizationId: lookup.organizationId },
            intention: { executionId: 'execution-1', resultId: lookup.id, state: 'pending' },
        })

        await expect(new TypeOrmVerificationResultReader(store).findOwned(lookup)).resolves.toBeNull()
    })

    it('keeps a legacy result readable when it has no settlement intention at all', async () => {
        const store = manager({ result: { ...baseResult(), organizationId: lookup.organizationId } })

        await expect(new TypeOrmVerificationResultReader(store).findOwned(lookup)).resolves.not.toBeNull()
    })

    it('preserves a persistence failure instead of reporting that a result does not exist', async () => {
        const error = new Error('Database unavailable')
        const reader = new TypeOrmVerificationResultReader({ findOneBy: jest.fn().mockRejectedValue(error) })

        await expect(reader.findOwned(lookup)).rejects.toBe(error)
    })

    function baseResult(): Record<string, unknown> {
        return {
            id: lookup.id,
            email: 'person@example.test',
            localPart: 'person',
            domain: 'example.test',
            mxDomain: 'mx.example.test',
            targetExchange: 'mx.example.test',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            evidenceObservedAt: new Date('2025-12-31T00:00:00.000Z'),
        }
    }
})
