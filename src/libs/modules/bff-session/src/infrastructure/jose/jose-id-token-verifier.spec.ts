import { createRemoteJWKSet, errors, jwtVerify, JWTVerifyGetKey } from 'jose'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { IdTokenVerificationFailedError } from '../../application/id-token-verifier'
import { JoseIdTokenVerifier } from './jose-id-token-verifier'

jest.mock('jose', () => ({
    ...jest.requireActual<typeof import('jose')>('jose'),
    createRemoteJWKSet: jest.fn(),
    jwtVerify: jest.fn(),
}))

const mockedCreateRemoteJwkSet = jest.mocked(createRemoteJWKSet)
const mockedJwtVerify = jest.mocked(jwtVerify)

describe('JoseIdTokenVerifier', () => {
    const configuration: BffSessionConfiguration = {
        appBaseUrl: 'http://localhost:53000',
        issuer: 'https://issuer.example.test/realms/lead-email-finder',
        backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
        jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
        clientId: 'lef-web-bff',
        clientSecret: 'secret',
        sessionIdleTimeoutMs: 1000,
        sessionAbsoluteTimeoutMs: 2000,
        isSecureCookie: false,
    }
    let verifier: JoseIdTokenVerifier
    let remoteJwkSet: jest.MockedFunction<JWTVerifyGetKey>

    beforeEach(() => {
        jest.clearAllMocks()
        remoteJwkSet = jest.fn()
        mockedCreateRemoteJwkSet.mockReturnValue(remoteJwkSet as unknown as ReturnType<typeof createRemoteJWKSet>)
        verifier = new JoseIdTokenVerifier(configuration)
    })

    it('returns issuer, subject, and email from a valid ID token with a matching nonce', async () => {
        mockedJwtVerify.mockResolvedValue({
            payload: {
                aud: configuration.clientId,
                azp: configuration.clientId,
                sub: 'human-1',
                nonce: 'the-nonce',
                email: 'person@example.test',
            },
        } as never)

        const result = await verifier.verify('a.b.c', 'the-nonce')

        expect(result).toEqual({ issuer: configuration.issuer, subject: 'human-1', email: 'person@example.test' })
        expect(createRemoteJWKSet).toHaveBeenCalledWith(
            new URL(configuration.jwksUri),
            expect.objectContaining({ timeoutDuration: 5000 }),
        )
        expect(mockedJwtVerify).toHaveBeenCalledWith(
            'a.b.c',
            expect.any(Function),
            expect.objectContaining({
                issuer: configuration.issuer,
                audience: configuration.clientId,
                algorithms: ['RS256'],
                typ: 'JWT',
                requiredClaims: ['exp'],
            }),
        )
    })

    it.each([
        ['absent', undefined],
        ['null', null],
    ])('returns a null email when the claim is %s', async (_name, email) => {
        mockedJwtVerify.mockResolvedValue({
            payload: { aud: configuration.clientId, sub: 'human-1', nonce: 'the-nonce', email },
        } as never)

        const result = await verifier.verify('a.b.c', 'the-nonce')

        expect(result.email).toBeNull()
    })

    it.each([
        ['malformed JWT', new errors.JWSInvalid('malformed token')],
        ['bad signature', new errors.JWSSignatureVerificationFailed()],
        ['invalid issuer', new errors.JWTClaimValidationFailed('unexpected issuer', {}, 'iss', 'check_failed')],
        ['invalid audience', new errors.JWTClaimValidationFailed('unexpected audience', {}, 'aud', 'check_failed')],
        ['expired token', new errors.JWTExpired('expired', {}, 'exp', 'check_failed')],
        ['disallowed algorithm', new errors.JOSEAlgNotAllowed('algorithm not allowed')],
        ['unsupported token algorithm', new errors.JOSENotSupported('algorithm not supported')],
        ['invalid claims', new errors.JWTInvalid('invalid claims')],
    ])('throws IdTokenVerificationFailedError for %s', async (_name, error) => {
        mockedJwtVerify.mockRejectedValue(error)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it.each([new errors.JWKSNoMatchingKey(), new errors.JWKSMultipleMatchingKeys()])(
        'throws IdTokenVerificationFailedError for an expected key-selection rejection (%s)',
        async error => {
            remoteJwkSet.mockRejectedValue(error)
            mockedJwtVerify.mockImplementation(async (_token, key) => {
                await key({ alg: 'RS256' }, { payload: '', signature: '' })
                throw new Error('unreachable')
            })

            await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
        },
    )

    it.each([
        new Error('request failed'),
        new errors.JWKSTimeout(),
        new errors.JWKSInvalid('malformed JWKS'),
        new errors.JOSENotSupported('provider key is not supported'),
    ])('preserves an unexpected JWKS failure (%s)', async error => {
        remoteJwkSet.mockRejectedValue(error)
        mockedJwtVerify.mockImplementation(async (_token, key) => {
            await key({ alg: 'RS256' }, { payload: '', signature: '' })
            throw new Error('unreachable')
        })

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toBe(error)
    })

    it('preserves an unexpected verifier failure', async () => {
        const error = new Error('unexpected programming fault')
        mockedJwtVerify.mockRejectedValue(error)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toBe(error)
    })

    it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 42],
    ])('throws IdTokenVerificationFailedError when the subject claim is %s', async (_name, sub) => {
        mockedJwtVerify.mockResolvedValue({
            payload: { aud: configuration.clientId, sub, nonce: 'the-nonce' },
        } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it.each([
        ['missing', undefined],
        ['not a string', 42],
        ['different', 'a-different-nonce'],
    ])('throws IdTokenVerificationFailedError when the nonce claim is %s', async (_name, nonce) => {
        mockedJwtVerify.mockResolvedValue({
            payload: { aud: configuration.clientId, sub: 'human-1', nonce },
        } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it('throws IdTokenVerificationFailedError when a present email claim is not a string', async () => {
        mockedJwtVerify.mockResolvedValue({
            payload: {
                aud: configuration.clientId,
                sub: 'human-1',
                nonce: 'the-nonce',
                email: ['person@example.test'],
            },
        } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it.each([
        ['an additional audience', { aud: [configuration.clientId, 'another-client'] }],
        ['a duplicate audience', { aud: [configuration.clientId, configuration.clientId] }],
        ['a different authorized party', { aud: configuration.clientId, azp: 'another-client' }],
        ['a malformed authorized party', { aud: configuration.clientId, azp: ['another-client'] }],
    ])('throws IdTokenVerificationFailedError for %s', async (_name, claims) => {
        mockedJwtVerify.mockResolvedValue({
            payload: { sub: 'human-1', nonce: 'the-nonce', ...claims },
        } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it('accepts a single-element audience array and a matching authorized party', async () => {
        mockedJwtVerify.mockResolvedValue({
            payload: {
                aud: [configuration.clientId],
                azp: configuration.clientId,
                sub: 'human-1',
                nonce: 'the-nonce',
            },
        } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).resolves.toEqual({
            issuer: configuration.issuer,
            subject: 'human-1',
            email: null,
        })
    })
})
