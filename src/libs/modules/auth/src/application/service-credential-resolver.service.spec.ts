import { ActiveServiceCredentialReader, ServiceCredentialRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from './credential-authenticator'
import { ServiceCredentialResolver } from './service-credential-resolver.service'

describe('ServiceCredentialResolver', () => {
    let readerMock: jest.Mocked<ActiveServiceCredentialReader>
    let resolver: ServiceCredentialResolver

    beforeEach(() => {
        readerMock = { findByIssuerAndSubject: jest.fn() }
        resolver = new ServiceCredentialResolver(readerMock)
    })

    const credential: ServiceCredentialRecord = {
        id: 'cred-1',
        organizationId: 'org-1',
        issuer: 'iss',
        subject: 'sub',
        keycloakClientId: 'client-1',
        permissions: ['verification:run'],
        status: 'active',
    }

    it('returns the credential when found and active', async () => {
        readerMock.findByIssuerAndSubject.mockResolvedValueOnce(credential)

        const result = await resolver.resolveActive('iss', 'sub')

        expect(result).toBe(credential)
        expect(readerMock.findByIssuerAndSubject).toHaveBeenCalledWith('iss', 'sub')
    })

    it('throws CredentialRejectedError when no credential matches the issuer and subject', async () => {
        readerMock.findByIssuerAndSubject.mockResolvedValueOnce(undefined)

        await expect(resolver.resolveActive('iss', 'sub')).rejects.toThrow(CredentialRejectedError)
    })

    it('throws CredentialRejectedError when the matching credential is disabled', async () => {
        readerMock.findByIssuerAndSubject.mockResolvedValueOnce({ ...credential, status: 'disabled' })

        await expect(resolver.resolveActive('iss', 'sub')).rejects.toThrow(CredentialRejectedError)
    })
})
