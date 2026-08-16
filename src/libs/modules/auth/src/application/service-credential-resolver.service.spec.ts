import { UnauthorizedException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test, TestingModule } from '@nestjs/testing'
import { Repository } from 'typeorm'
import { ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceCredentialResolver } from './service-credential-resolver.service'

describe('ServiceCredentialResolver', () => {
    let resolver: ServiceCredentialResolver
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'findOne'>>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ServiceCredentialResolver,
                { provide: getRepositoryToken(ServiceCredential), useValue: { findOne: jest.fn() } },
            ],
        }).compile()

        resolver = module.get(ServiceCredentialResolver)
        repoMock = module.get(getRepositoryToken(ServiceCredential))
    })

    it('returns the credential when found and active', async () => {
        const credential = { issuer: 'iss', subject: 'sub', status: 'active' } as ServiceCredential
        repoMock.findOne.mockResolvedValue(credential)

        const result = await resolver.resolveActive('iss', 'sub')

        expect(result).toBe(credential)
        expect(repoMock.findOne).toHaveBeenCalledWith({ where: { issuer: 'iss', subject: 'sub' } })
    })

    it('throws when no credential matches the issuer and subject', async () => {
        repoMock.findOne.mockResolvedValue(null)

        await expect(resolver.resolveActive('iss', 'sub')).rejects.toThrow(UnauthorizedException)
    })

    it('throws when the matching credential is disabled', async () => {
        const credential = { issuer: 'iss', subject: 'sub', status: 'disabled' } as ServiceCredential
        repoMock.findOne.mockResolvedValue(credential)

        await expect(resolver.resolveActive('iss', 'sub')).rejects.toThrow(UnauthorizedException)
    })
})
