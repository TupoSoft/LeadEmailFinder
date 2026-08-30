import { Repository } from 'typeorm'
import { ExternalIdentityConflictError } from '../../application/ports/external-identity-store'
import { ExternalIdentityRecord } from '../../domain/external-identity-record'
import { ExternalIdentity } from './external-identity.entity'
import { TypeOrmExternalIdentityStore } from './typeorm-external-identity-store'

describe('TypeOrmExternalIdentityStore', () => {
    let repoMock: jest.Mocked<Pick<Repository<ExternalIdentity>, 'findOne' | 'update' | 'create' | 'save'>>
    let store: TypeOrmExternalIdentityStore

    beforeEach(() => {
        repoMock = { findOne: jest.fn(), update: jest.fn(), create: jest.fn(), save: jest.fn() }
        store = new TypeOrmExternalIdentityStore(repoMock as unknown as Repository<ExternalIdentity>)
    })

    const entity: ExternalIdentity = {
        id: 'id-1',
        issuer: 'iss',
        subject: 'sub',
        email: 'a@example.test',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    describe('findByIssuerAndSubject', () => {
        it('queries by exactly issuer and subject and maps the result', async () => {
            repoMock.findOne.mockResolvedValueOnce(entity)

            const result = await store.findByIssuerAndSubject('iss', 'sub')

            expect(repoMock.findOne).toHaveBeenCalledWith({ where: { issuer: 'iss', subject: 'sub' } })
            expect(result).toEqual({ id: 'id-1', issuer: 'iss', subject: 'sub', email: 'a@example.test' })
        })

        it('returns undefined when not found', async () => {
            repoMock.findOne.mockResolvedValueOnce(null)

            await expect(store.findByIssuerAndSubject('iss', 'sub')).resolves.toBeUndefined()
        })
    })

    describe('updateEmail', () => {
        it('updates only the email column and returns the merged record without a re-read', async () => {
            const existing: ExternalIdentityRecord = { id: 'id-1', issuer: 'iss', subject: 'sub', email: 'old@example.test' }

            const result = await store.updateEmail(existing, 'new@example.test')

            expect(repoMock.update).toHaveBeenCalledWith('id-1', { email: 'new@example.test' })
            expect(repoMock.findOne).not.toHaveBeenCalled()
            expect(result).toEqual({ id: 'id-1', issuer: 'iss', subject: 'sub', email: 'new@example.test' })
        })
    })

    describe('create', () => {
        it('creates and saves a new identity, mapping the result', async () => {
            repoMock.create.mockReturnValueOnce(entity)
            repoMock.save.mockResolvedValueOnce(entity)

            const result = await store.create('iss', 'sub', 'a@example.test')

            expect(repoMock.create).toHaveBeenCalledWith({ issuer: 'iss', subject: 'sub', email: 'a@example.test' })
            expect(result).toEqual({ id: 'id-1', issuer: 'iss', subject: 'sub', email: 'a@example.test' })
        })

        it('throws ExternalIdentityConflictError on a Postgres unique-violation', async () => {
            repoMock.create.mockReturnValueOnce(entity)
            repoMock.save.mockRejectedValueOnce({ code: '23505' })

            await expect(store.create('iss', 'sub', null)).rejects.toThrow(ExternalIdentityConflictError)
        })

        it('rethrows an unrelated error untouched', async () => {
            repoMock.create.mockReturnValueOnce(entity)
            const unrelated = new Error('boom')
            repoMock.save.mockRejectedValueOnce(unrelated)

            await expect(store.create('iss', 'sub', null)).rejects.toBe(unrelated)
        })
    })
})
