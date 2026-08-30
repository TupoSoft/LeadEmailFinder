import { ExternalIdentityRecord } from '../domain/external-identity-record'
import { ExternalIdentityResolver } from './external-identity-resolver.service'
import { ExternalIdentityConflictError, ExternalIdentityStore } from './ports/external-identity-store'

describe('ExternalIdentityResolver', () => {
    let storeMock: jest.Mocked<ExternalIdentityStore>
    let resolver: ExternalIdentityResolver

    beforeEach(() => {
        storeMock = { findByIssuerAndSubject: jest.fn(), updateEmail: jest.fn(), create: jest.fn() }
        resolver = new ExternalIdentityResolver(storeMock)
    })

    const existing: ExternalIdentityRecord = { id: 'id-1', issuer: 'iss', subject: 'sub', email: 'a@example.test' }

    it('returns the existing record unchanged when the email matches', async () => {
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(existing)

        const result = await resolver.resolveOrCreate('iss', 'sub', 'a@example.test')

        expect(result).toBe(existing)
        expect(storeMock.updateEmail).not.toHaveBeenCalled()
    })

    it('updates the email when it has changed and returns the updated record', async () => {
        const updated: ExternalIdentityRecord = { ...existing, email: 'b@example.test' }
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(existing)
        storeMock.updateEmail.mockResolvedValueOnce(updated)

        const result = await resolver.resolveOrCreate('iss', 'sub', 'b@example.test')

        expect(storeMock.updateEmail).toHaveBeenCalledWith(existing, 'b@example.test')
        expect(result).toBe(updated)
    })

    it('creates a new identity when none exists', async () => {
        const created: ExternalIdentityRecord = { id: 'id-2', issuer: 'iss', subject: 'sub', email: null }
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)
        storeMock.create.mockResolvedValueOnce(created)

        const result = await resolver.resolveOrCreate('iss', 'sub', null)

        expect(storeMock.create).toHaveBeenCalledWith('iss', 'sub', null)
        expect(result).toBe(created)
    })

    it('recovers from a concurrent create by re-finding the raced record', async () => {
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)
        storeMock.create.mockRejectedValueOnce(new ExternalIdentityConflictError('iss', 'sub'))
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(existing)

        const result = await resolver.resolveOrCreate('iss', 'sub', 'a@example.test')

        expect(result).toBe(existing)
        expect(storeMock.findByIssuerAndSubject).toHaveBeenCalledTimes(2)
    })

    it('rethrows an unrelated error from create', async () => {
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)
        storeMock.create.mockRejectedValueOnce(new Error('boom'))

        await expect(resolver.resolveOrCreate('iss', 'sub', null)).rejects.toThrow('boom')
        expect(storeMock.findByIssuerAndSubject).toHaveBeenCalledTimes(1)
    })

    it('rethrows the conflict error if the raced record is still not found', async () => {
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)
        const conflict = new ExternalIdentityConflictError('iss', 'sub')
        storeMock.create.mockRejectedValueOnce(conflict)
        storeMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)

        await expect(resolver.resolveOrCreate('iss', 'sub', null)).rejects.toBe(conflict)
    })
})
