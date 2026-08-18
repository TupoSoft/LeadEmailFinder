import { Repository } from 'typeorm'
import { ExternalIdentity } from '@tuposoft/lead-email-finder/modules/identity'
import { HumanIdentityResolver } from './human-identity-resolver.service'

describe('HumanIdentityResolver', () => {
    let externalIdentityRepo: jest.Mocked<Pick<Repository<ExternalIdentity>, 'findOne' | 'save' | 'create'>>
    let resolver: HumanIdentityResolver

    beforeEach(() => {
        externalIdentityRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() }
        resolver = new HumanIdentityResolver(externalIdentityRepo as unknown as Repository<ExternalIdentity>)
    })

    it('returns the existing identity unchanged when the email matches', async () => {
        const existing = { id: 'id-1', issuer: 'iss', subject: 'sub', email: 'person@example.test' } as ExternalIdentity
        externalIdentityRepo.findOne.mockResolvedValue(existing)

        const result = await resolver.resolveOrCreate('iss', 'sub', 'person@example.test')

        expect(result).toBe(existing)
        expect(externalIdentityRepo.save).not.toHaveBeenCalled()
    })

    it('updates and saves the email when it has changed', async () => {
        const existing = { id: 'id-1', issuer: 'iss', subject: 'sub', email: 'old@example.test' } as ExternalIdentity
        externalIdentityRepo.findOne.mockResolvedValue(existing)
        externalIdentityRepo.save.mockImplementation(entity => Promise.resolve(entity as ExternalIdentity))

        const result = await resolver.resolveOrCreate('iss', 'sub', 'new@example.test')

        expect(result.email).toBe('new@example.test')
        expect(externalIdentityRepo.save).toHaveBeenCalled()
    })

    it('creates a new identity when none exists', async () => {
        externalIdentityRepo.findOne.mockResolvedValue(null)
        const created = { id: 'id-1', issuer: 'iss', subject: 'sub', email: null } as ExternalIdentity
        externalIdentityRepo.create.mockReturnValue(created)
        externalIdentityRepo.save.mockResolvedValue(created)

        const result = await resolver.resolveOrCreate('iss', 'sub', null)

        expect(result).toBe(created)
        expect(externalIdentityRepo.create).toHaveBeenCalledWith({ issuer: 'iss', subject: 'sub', email: null })
    })

    it('re-reads the row instead of throwing when a concurrent first login already created it', async () => {
        externalIdentityRepo.findOne.mockResolvedValueOnce(null)
        const created = { id: 'id-1', issuer: 'iss', subject: 'sub', email: null } as ExternalIdentity
        externalIdentityRepo.create.mockReturnValue(created)
        externalIdentityRepo.save.mockRejectedValue({ code: '23505' })
        externalIdentityRepo.findOne.mockResolvedValueOnce(created)

        const result = await resolver.resolveOrCreate('iss', 'sub', null)

        expect(result).toBe(created)
    })

    it('rethrows non-unique-violation errors from creation', async () => {
        externalIdentityRepo.findOne.mockResolvedValue(null)
        externalIdentityRepo.create.mockReturnValue({} as ExternalIdentity)
        externalIdentityRepo.save.mockRejectedValue(new Error('connection reset'))

        await expect(resolver.resolveOrCreate('iss', 'sub', null)).rejects.toThrow('connection reset')
    })
})
