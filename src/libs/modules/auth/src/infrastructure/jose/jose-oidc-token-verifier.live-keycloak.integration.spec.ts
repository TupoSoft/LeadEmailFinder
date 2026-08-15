import { UnauthorizedException } from '@nestjs/common'
import { JoseOidcTokenVerifier } from './jose-oidc-token-verifier'
import { OidcConfiguration } from './oidc-configuration'

const issuer = process.env['TEST_OIDC_ISSUER_URL']
const clientId = process.env['TEST_OIDC_CLIENT_ID']
const clientSecret = process.env['TEST_OIDC_CLIENT_SECRET']
const audience = process.env['TEST_OIDC_AUDIENCE']

const describeWithKeycloak = issuer && clientId && clientSecret && audience ? describe : describe.skip

interface TokenResponse {
    access_token?: string
    error?: string
}

function tamperSignature(token: string): string {
    const [header, payload, signature] = token.split('.')
    // Flip a character in the middle of the signature, not the last one: RS256 (2048-bit RSA, 256-byte)
    // signatures have 256 % 3 === 1 leftover byte, whose base64url encoding ends in unused padding bits —
    // flipping only the final character can land entirely in those don't-care bits and decode to the same
    // signature bytes, leaving the token still valid and making this assertion flaky.
    const flipIndex = Math.floor(signature.length / 2)
    const flippedChar = signature[flipIndex] === 'a' ? 'b' : 'a'
    const tamperedSignature = signature.slice(0, flipIndex) + flippedChar + signature.slice(flipIndex + 1)
    return [header, payload, tamperedSignature].join('.')
}

async function obtainClientCredentialsToken(): Promise<string> {
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId!,
            client_secret: clientSecret!,
        }),
    })
    const token = (await response.json()) as TokenResponse
    if (!response.ok || !token.access_token) {
        throw new Error(`Client Credentials failed with HTTP ${response.status}: ${token.error ?? 'unknown error'}`)
    }
    return token.access_token
}

describeWithKeycloak('JoseOidcTokenVerifier against a live Keycloak realm', () => {
    const configuration: OidcConfiguration = {
        issuer: issuer!,
        audience: audience!,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
    }

    it('verifies a real Client Credentials access token', async () => {
        const token = await obtainClientCredentialsToken()
        const verifier = new JoseOidcTokenVerifier(configuration)

        const result = await verifier.verify(token)

        expect(result.issuer).toBe(issuer)
        expect(typeof result.subject).toBe('string')
        expect(result.subject.length).toBeGreaterThan(0)
    })

    it('rejects a token issued for a different audience', async () => {
        const token = await obtainClientCredentialsToken()
        const verifier = new JoseOidcTokenVerifier({ ...configuration, audience: 'a-different-audience' })

        await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException)
    })

    it('rejects a tampered token', async () => {
        const token = await obtainClientCredentialsToken()
        const tampered = tamperSignature(token)
        const verifier = new JoseOidcTokenVerifier(configuration)

        await expect(verifier.verify(tampered)).rejects.toThrow(UnauthorizedException)
    })

    it('rejects when the JWKS endpoint is unreachable', async () => {
        const token = await obtainClientCredentialsToken()
        const verifier = new JoseOidcTokenVerifier({
            ...configuration,
            jwksUri: 'https://127.0.0.1:1/protocol/openid-connect/certs',
        })

        await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException)
    })
})
