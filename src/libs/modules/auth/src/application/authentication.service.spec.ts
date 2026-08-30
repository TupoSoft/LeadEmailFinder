import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from './authentication.service'
import { CredentialAuthenticator, CredentialRejectedError, ExtractedCredential } from './credential-authenticator'
import { CredentialExtractor } from './credential-extractor'

describe('AuthenticationService', () => {
    let credentialExtractor: jest.Mocked<CredentialExtractor>
    let firstAuthenticator: jest.Mocked<CredentialAuthenticator>
    let secondAuthenticator: jest.Mocked<CredentialAuthenticator>
    let service: AuthenticationService

    beforeEach(() => {
        credentialExtractor = { extract: jest.fn() } as unknown as jest.Mocked<CredentialExtractor>
        firstAuthenticator = { supports: jest.fn(), authenticate: jest.fn() }
        secondAuthenticator = { supports: jest.fn(), authenticate: jest.fn() }
        service = new AuthenticationService(credentialExtractor, [firstAuthenticator, secondAuthenticator])
    })

    it('throws when no credential can be extracted from the headers', async () => {
        credentialExtractor.extract.mockReturnValue(undefined)

        await expect(service.authenticate({})).rejects.toThrow(CredentialRejectedError)
    })

    it('throws when no authenticator supports the extracted credential', async () => {
        const credential: ExtractedCredential = { scheme: 'bearer', token: 'token' }
        credentialExtractor.extract.mockReturnValue(credential)
        firstAuthenticator.supports.mockReturnValue(false)
        secondAuthenticator.supports.mockReturnValue(false)

        await expect(service.authenticate({})).rejects.toThrow(CredentialRejectedError)
        expect(firstAuthenticator.authenticate).not.toHaveBeenCalled()
        expect(secondAuthenticator.authenticate).not.toHaveBeenCalled()
    })

    it('delegates to the first authenticator that supports the credential', async () => {
        const credential: ExtractedCredential = { scheme: 'bearer', token: 'token' }
        const principal = { credentialKind: 'service_client' } as AuthPrincipal
        credentialExtractor.extract.mockReturnValue(credential)
        firstAuthenticator.supports.mockReturnValue(false)
        secondAuthenticator.supports.mockReturnValue(true)
        secondAuthenticator.authenticate.mockResolvedValue(principal)

        const result = await service.authenticate({})

        expect(result).toBe(principal)
        expect(firstAuthenticator.authenticate).not.toHaveBeenCalled()
        expect(secondAuthenticator.authenticate).toHaveBeenCalledWith(credential)
    })

    it('propagates a rejection from the matched authenticator', async () => {
        const credential: ExtractedCredential = { scheme: 'bearer', token: 'token' }
        credentialExtractor.extract.mockReturnValue(credential)
        firstAuthenticator.supports.mockReturnValue(true)
        firstAuthenticator.authenticate.mockRejectedValue(new CredentialRejectedError('invalid'))

        await expect(service.authenticate({})).rejects.toThrow(CredentialRejectedError)
    })
})
