import { ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { OidcCredentialAuthenticator } from './oidc-credential-authenticator'
import { OidcTokenVerifier } from './oidc-token-verifier'
import { ServiceCredentialResolver } from './service-credential-resolver.service'

describe('OidcCredentialAuthenticator', () => {
    let tokenVerifier: jest.Mocked<OidcTokenVerifier>
    let serviceCredentialResolver: jest.Mocked<ServiceCredentialResolver>
    let authenticator: OidcCredentialAuthenticator

    beforeEach(() => {
        tokenVerifier = { verify: jest.fn() }
        serviceCredentialResolver = { resolveActive: jest.fn() } as unknown as jest.Mocked<ServiceCredentialResolver>
        authenticator = new OidcCredentialAuthenticator(tokenVerifier, serviceCredentialResolver)
    })

    describe('supports', () => {
        it('supports a JWT-shaped bearer token', () => {
            expect(authenticator.supports({ scheme: 'bearer', token: 'a.b.c' })).toBe(true)
        })

        it('does not support a non-JWT-shaped bearer token', () => {
            expect(authenticator.supports({ scheme: 'bearer', token: 'api_legacykey' })).toBe(false)
        })

        it('does not support a session-cookie credential', () => {
            expect(authenticator.supports({ scheme: 'session-cookie', token: 'a.b.c' })).toBe(false)
        })
    })

    describe('authenticate', () => {
        it('builds an AuthPrincipal from the verified token and resolved service credential', async () => {
            tokenVerifier.verify.mockResolvedValue({ issuer: 'https://issuer', subject: 'service-account-1' })
            const serviceCredential = {
                id: 'credential-id',
                organizationId: 'organization-id',
                permissions: ['verification:run'],
            } as ServiceCredential
            serviceCredentialResolver.resolveActive.mockResolvedValue(serviceCredential)

            const principal = await authenticator.authenticate({ scheme: 'bearer', token: 'a.b.c' })

            expect(serviceCredentialResolver.resolveActive).toHaveBeenCalledWith('https://issuer', 'service-account-1')
            expect(principal).toEqual({
                credentialKind: 'service_client',
                issuer: 'https://issuer',
                subject: 'service-account-1',
                organizationId: 'organization-id',
                membershipRole: 'admin',
                permissions: ['verification:run'],
                credentialId: 'credential-id',
            })
        })

        it('never derives organizationId from anything other than the resolved service credential', async () => {
            tokenVerifier.verify.mockResolvedValue({ issuer: 'https://issuer', subject: 'service-account-1' })
            const serviceCredential = {
                id: 'credential-id',
                organizationId: 'true-organization-id',
                permissions: [],
            } as unknown as ServiceCredential
            serviceCredentialResolver.resolveActive.mockResolvedValue(serviceCredential)

            const principal = await authenticator.authenticate({ scheme: 'bearer', token: 'a.b.c' })

            expect(principal.organizationId).toBe('true-organization-id')
        })
    })
})
