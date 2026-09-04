import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { TypeOrmVerificationResultReader } from './typeorm-verification-result-reader'

describe('TypeOrmVerificationResultReader', () => {
    const lookup = {
        id: '00000000-0000-4000-8000-000000000001',
        organizationId: '00000000-0000-4000-8000-000000000002',
    }

    it('queries result identity and authenticated ownership in the same persistence predicate', async () => {
        const repository = { findOneBy: jest.fn().mockResolvedValue(null) }
        const reader = new TypeOrmVerificationResultReader(repository)

        await expect(reader.findOwned(lookup)).resolves.toBeNull()
        expect(repository.findOneBy).toHaveBeenCalledTimes(1)
        expect(repository.findOneBy).toHaveBeenCalledWith(lookup)
    })

    it('exposes the current result contract without persistence-only fields', async () => {
        const result = {
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
        }
        const repository = {
            findOneBy: jest.fn().mockResolvedValue({
                ...result,
                organizationId: lookup.organizationId,
                batchId: '00000000-0000-4000-8000-000000000003',
                futurePrivateColumn: 'private',
            }),
        }

        const response = await new TypeOrmVerificationResultReader(repository).findOwned(lookup)

        expect(response).toEqual({ ...result, format: undefined })
        expect(response).not.toHaveProperty('organizationId')
        expect(response).not.toHaveProperty('batchId')
        expect(response).not.toHaveProperty('futurePrivateColumn')
    })

    it('preserves a persistence failure instead of reporting that a result does not exist', async () => {
        const error = new Error('Database unavailable')
        const reader = new TypeOrmVerificationResultReader({ findOneBy: jest.fn().mockRejectedValue(error) })

        await expect(reader.findOwned(lookup)).rejects.toBe(error)
    })
})
