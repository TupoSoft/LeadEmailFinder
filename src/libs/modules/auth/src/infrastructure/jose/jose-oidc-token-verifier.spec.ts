import { createRemoteJWKSet, errors, jwtVerify, JWTVerifyGetKey } from 'jose'
import { OidcTokenRejectedError } from '../../application/oidc-token-verifier'
import { JoseOidcTokenVerifier } from './jose-oidc-token-verifier'
import { OidcConfiguration } from './oidc-configuration'

jest.mock('jose', () => ({
    ...jest.requireActual<typeof import('jose')>('jose'),
    createRemoteJWKSet: jest.fn(),
    jwtVerify: jest.fn(),
}))

const mockedCreateRemoteJwkSet = jest.mocked(createRemoteJWKSet)
const mockedJwtVerify = jest.mocked(jwtVerify)

describe('JoseOidcTokenVerifier', () => {
    const configuration: OidcConfiguration = {
        issuer: 'https://issuer.example.test/realms/lead-email-finder',
        audience: 'lead-email-finder-api',
        jwksUri: 'https://issuer.example.test/realms/lead-email-finder/protocol/openid-connect/certs',
    }
    let verifier: JoseOidcTokenVerifier
    let remoteJwkSet: jest.MockedFunction<JWTVerifyGetKey>

    beforeEach(() => {
        jest.clearAllMocks()
        remoteJwkSet = jest.fn()
        mockedCreateRemoteJwkSet.mockReturnValue(
            remoteJwkSet as unknown as ReturnType<typeof createRemoteJWKSet>,
        )
        verifier = new JoseOidcTokenVerifier(configuration)
    })

    it('returns the issuer and subject from a valid token', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { sub: 'service-account-1' } } as never)

        const result = await verifier.verify('a.b.c')

        expect(result).toEqual({ issuer: configuration.issuer, subject: 'service-account-1' })
        expect(mockedJwtVerify).toHaveBeenCalledWith(
            'a.b.c',
            expect.any(Function),
            expect.objectContaining({
                issuer: configuration.issuer,
                audience: configuration.audience,
                algorithms: ['RS256'],
                typ: 'JWT',
            }),
        )
    })

    it.each([
        new errors.JWSInvalid('malformed token'),
        new errors.JWSSignatureVerificationFailed(),
        new errors.JWTClaimValidationFailed('unexpected issuer', {}, 'iss', 'check_failed'),
        new errors.JWTExpired('expired', {}, 'exp', 'check_failed'),
        new errors.JOSEAlgNotAllowed('algorithm not allowed'),
        new errors.JOSENotSupported('algorithm not supported'),
        new errors.JWTInvalid('invalid claims'),
    ])('throws OidcTokenRejectedError for an expected token rejection (%s)', async error => {
        mockedJwtVerify.mockRejectedValue(error)

        await expect(verifier.verify('a.b.c')).rejects.toThrow(OidcTokenRejectedError)
    })

    it.each([new errors.JWKSNoMatchingKey(), new errors.JWKSMultipleMatchingKeys()])(
        'throws OidcTokenRejectedError for an expected key-selection rejection (%s)',
        async error => {
            remoteJwkSet.mockRejectedValue(error)
            mockedJwtVerify.mockImplementation(async (_token, key) => {
                await key({ alg: 'RS256' }, { payload: '', signature: '' })
                throw new Error('unreachable')
            })

            await expect(verifier.verify('a.b.c')).rejects.toThrow(OidcTokenRejectedError)
        },
    )

    it.each([
        new Error('request failed'),
        new errors.JWKSTimeout(),
        new errors.JWKSInvalid('malformed JWKS'),
        new errors.JOSENotSupported('provider key is not supported'),
    ])(
        'preserves an unexpected JWKS failure (%s)',
        async error => {
            remoteJwkSet.mockRejectedValue(error)
            mockedJwtVerify.mockImplementation(async (_token, key) => {
                await key({ alg: 'RS256' }, { payload: '', signature: '' })
                throw new Error('unreachable')
            })

            await expect(verifier.verify('a.b.c')).rejects.toBe(error)
        },
    )

    it('throws OidcTokenRejectedError when the token has no subject claim', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: {} } as never)

        await expect(verifier.verify('a.b.c')).rejects.toThrow(OidcTokenRejectedError)
    })
})
