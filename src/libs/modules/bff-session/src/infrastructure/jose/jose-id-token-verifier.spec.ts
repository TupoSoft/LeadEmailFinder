import { UnauthorizedException } from '@nestjs/common'
import { jwtVerify } from 'jose'
import { BffSessionConfiguration } from '../config/bff-session-configuration'
import { JoseIdTokenVerifier } from './jose-id-token-verifier'

jest.mock('jose', () => ({
    createRemoteJWKSet: jest.fn().mockReturnValue('remote-jwk-set'),
    jwtVerify: jest.fn(),
}))

const mockedJwtVerify = jest.mocked(jwtVerify)

describe('JoseIdTokenVerifier', () => {
    const configuration: BffSessionConfiguration = {
        appBaseUrl: 'http://localhost:53000',
        issuer: 'https://issuer.example.test/realms/lead-email-finder',
        clientId: 'lef-web-bff',
        clientSecret: 'secret',
        sessionIdleTimeoutMs: 1000,
        sessionAbsoluteTimeoutMs: 2000,
        isSecureCookie: false,
    }
    let verifier: JoseIdTokenVerifier

    beforeEach(() => {
        jest.clearAllMocks()
        verifier = new JoseIdTokenVerifier(configuration)
    })

    it('returns issuer, subject, and email from a valid ID token with a matching nonce', async () => {
        mockedJwtVerify.mockResolvedValue({
            payload: { sub: 'human-1', nonce: 'the-nonce', email: 'person@example.test' },
        } as never)

        const result = await verifier.verify('a.b.c', 'the-nonce')

        expect(result).toEqual({ issuer: configuration.issuer, subject: 'human-1', email: 'person@example.test' })
        expect(mockedJwtVerify).toHaveBeenCalledWith(
            'a.b.c',
            'remote-jwk-set',
            expect.objectContaining({
                issuer: configuration.issuer,
                audience: configuration.clientId,
                algorithms: ['RS256'],
                typ: 'JWT',
            }),
        )
    })

    it('returns a null email when the claim is absent', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { sub: 'human-1', nonce: 'the-nonce' } } as never)

        const result = await verifier.verify('a.b.c', 'the-nonce')

        expect(result.email).toBeNull()
    })

    it('throws UnauthorizedException when verification rejects', async () => {
        mockedJwtVerify.mockRejectedValue(new Error('signature verification failed'))

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when the token has no subject claim', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { nonce: 'the-nonce' } } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when the nonce claim is missing', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { sub: 'human-1' } } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when the nonce does not match the expected value', async () => {
        mockedJwtVerify.mockResolvedValue({ payload: { sub: 'human-1', nonce: 'a-different-nonce' } } as never)

        await expect(verifier.verify('a.b.c', 'the-nonce')).rejects.toThrow(UnauthorizedException)
    })
})
