import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from 'jose'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { IdTokenVerificationFailedError } from '../../application/id-token-verifier'
import { JoseIdTokenVerifier } from './jose-id-token-verifier'

describe('JoseIdTokenVerifier with a reachable JWKS endpoint and unreachable public issuer', () => {
    const clientId = 'lef-web-bff'
    let server: Server
    let signingKey: KeyLike
    let untrustedKey: KeyLike
    let configuration: BffSessionConfiguration
    let verifier: JoseIdTokenVerifier
    let requests: string[]

    beforeAll(async () => {
        const pair = await generateKeyPair('RS256')
        signingKey = pair.privateKey
        untrustedKey = (await generateKeyPair('RS256')).privateKey
        const publicKey = await exportJWK(pair.publicKey)
        server = createServer((request, response) => {
            requests.push(request.url ?? '')
            response.setHeader('content-type', 'application/json')
            response.end(JSON.stringify({ keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' }] }))
        })
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const { port } = server.address() as AddressInfo
        configuration = {
            appBaseUrl: 'http://localhost:53000',
            issuer: 'http://127.0.0.1:9/realms/public',
            backchannelUrl: 'http://keycloak:8080/realms/public',
            jwksUri: `http://127.0.0.1:${port}/internal/certs`,
            clientId,
            clientSecret: 'secret',
            sessionIdleTimeoutMs: 1000,
            sessionAbsoluteTimeoutMs: 2000,
            isSecureCookie: false,
        }
    })

    beforeEach(() => {
        requests = []
        verifier = new JoseIdTokenVerifier(configuration)
    })

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
        }
    })

    const signToken = (overrides: JWTPayload = {}, key?: KeyLike): Promise<string> =>
        new SignJWT({
            iss: configuration.issuer,
            aud: configuration.clientId,
            sub: 'human-1',
            nonce: 'login-nonce',
            exp: Math.floor(Date.now() / 1000) + 300,
            ...overrides,
        })
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })
            .sign(key ?? signingKey)

    it('retrieves keys from the independent endpoint and retains the public identity', async () => {
        const token = await signToken()

        await expect(verifier.verify(token, 'login-nonce')).resolves.toEqual({
            issuer: configuration.issuer,
            subject: 'human-1',
            email: null,
        })
        expect(requests).toEqual(['/internal/certs'])
    })

    it('rejects a correctly signed token claiming the internal issuer', async () => {
        const token = await signToken({ iss: configuration.backchannelUrl })

        await expect(verifier.verify(token, 'login-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
        expect(requests).toEqual(['/internal/certs'])
    })

    it.each([
        ['audience', { aud: 'another-client' }],
        ['additional audience', { aud: [clientId, 'another-client'], azp: clientId }],
        ['authorized party', { azp: 'another-client' }],
        ['expiry', { exp: 1 }],
        ['missing expiry', { exp: undefined }],
        ['nonce', { nonce: 'another-login' }],
    ])('continues to reject an invalid %s', async (_name, overrides) => {
        const token = await signToken(overrides as JWTPayload)

        await expect(verifier.verify(token, 'login-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it('continues to reject an untrusted signature', async () => {
        const token = await signToken({}, untrustedKey)

        await expect(verifier.verify(token, 'login-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it.each([
        ['empty subject', { sub: '' }],
        ['non-string email', { email: ['person@example.test'] }],
    ])('rejects a malformed %s claim shape', async (_name, overrides) => {
        const token = await signToken(overrides as JWTPayload)

        await expect(verifier.verify(token, 'login-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })

    it('rejects a malformed compact token', async () => {
        await expect(verifier.verify('not-a-jwt', 'login-nonce')).rejects.toThrow(IdTokenVerificationFailedError)
    })
})
