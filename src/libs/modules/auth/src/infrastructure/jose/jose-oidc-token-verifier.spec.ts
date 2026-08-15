import { UnauthorizedException } from '@nestjs/common'
import { jwtVerify } from 'jose'
import { JoseOidcTokenVerifier } from './jose-oidc-token-verifier'
import { OidcConfiguration } from './oidc-configuration'

jest.mock('jose', () => ({
    createRemoteJWKSet: jest.fn().mockReturnValue('remote-jwk-set'),
    jwtVerify: jest.fn(),
}))

const mockedJwtVerify = jest.mocked(jwtVerify)

describe('JoseOidcTokenVerifier', () => {
    const configuration: OidcConfiguration = {
        issuer: 'https://issuer.example.test/realms/lead-email-finder',
        audience: 'lead-email-finder-api',
        jwksUri: 'https://issuer.example.test/realms/lead-email-finder/protocol/openid-connect/certs',
    }
    let verifier: JoseOidcTokenVerifier

    beforeEach(() => {
        jest.clearAllMocks()
        verifier = new JoseOidcTokenVerifier(configuration)
    })

    it('returns the issuer and subject from a valid token', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { sub: 'service-account-1' } } as never)

        const result = await verifier.verify('a.b.c')

        expect(result).toEqual({ issuer: configuration.issuer, subject: 'service-account-1' })
        expect(mockedJwtVerify).toHaveBeenCalledWith(
            'a.b.c',
            'remote-jwk-set',
            expect.objectContaining({
                issuer: configuration.issuer,
                audience: configuration.audience,
                algorithms: ['RS256'],
                typ: 'JWT',
            }),
        )
    })

    it('throws UnauthorizedException when verification rejects', async () => {
        mockedJwtVerify.mockRejectedValue(new Error('signature verification failed'))

        await expect(verifier.verify('a.b.c')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when the JWKS fetch fails', async () => {
        mockedJwtVerify.mockRejectedValue(new Error('request timed out'))

        await expect(verifier.verify('a.b.c')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when the token has no subject claim', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: {} } as never)

        await expect(verifier.verify('a.b.c')).rejects.toThrow(UnauthorizedException)
    })
})
