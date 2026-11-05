import { Repository } from 'typeorm'
import { ServiceCredential } from './service-credential.entity'
import { TypeOrmActiveServiceCredentialReader } from './typeorm-active-service-credential-reader'

describe('TypeOrmActiveServiceCredentialReader', () => {
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'findOne'>>
    let reader: TypeOrmActiveServiceCredentialReader

    beforeEach(() => {
        repoMock = { findOne: jest.fn() }
        reader = new TypeOrmActiveServiceCredentialReader(repoMock as unknown as Repository<ServiceCredential>)
    })

    const credential: ServiceCredential = {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'iss',
        subject: 'sub',
        keyPrefix: 'client-1',
        description: null,
        permissions: ['platform:admin'],
        status: 'active',
    } as ServiceCredential

    it('queries by exactly issuer and subject, with no status filter', async () => {
        repoMock.findOne.mockResolvedValueOnce(credential)

        const result = await reader.findByIssuerAndSubject('iss', 'sub')

        expect(repoMock.findOne).toHaveBeenCalledWith({ where: { issuer: 'iss', subject: 'sub' } })
        expect(result).toEqual({
            id: 'sc-1',
            organizationId: 'org-1',
            issuer: 'iss',
            subject: 'sub',
            keyPrefix: 'client-1',
            permissions: ['platform:admin'],
            status: 'active',
        })
    })

    it('looks up the complete hash on every attempt and never returns it', async () => {
        repoMock.findOne.mockResolvedValue(credential)
        const hash = 'a'.repeat(64)
        await expect(reader.findByKeyHash(hash)).resolves.not.toHaveProperty('keyHash')
        await reader.findByKeyHash(hash)
        expect(repoMock.findOne).toHaveBeenCalledTimes(2)
        expect(repoMock.findOne).toHaveBeenLastCalledWith({ where: { keyHash: hash } })
    })

    it('returns a disabled credential as-is, without filtering it out', async () => {
        repoMock.findOne.mockResolvedValueOnce({ ...credential, status: 'disabled' })

        const result = await reader.findByIssuerAndSubject('iss', 'sub')

        expect(result?.status).toBe('disabled')
    })

    it('returns undefined when not found', async () => {
        repoMock.findOne.mockResolvedValueOnce(null)

        await expect(reader.findByIssuerAndSubject('iss', 'sub')).resolves.toBeUndefined()
    })
})
