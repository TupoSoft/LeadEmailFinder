import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BffClientCredentials, ServiceClientCredentials } from './provisioning'

interface TokenResponse {
    access_token?: string
    error?: string
}

function decodeJwtPayload(token: string): Record<string, unknown> {
    const payload = token.split('.')[1]
    if (!payload) {
        throw new Error('Keycloak returned a malformed access token')
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

async function waitForRealm(retrievalUrl: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${retrievalUrl}/.well-known/openid-configuration`)
            if (response.ok) return (await response.json()) as Record<string, unknown>
        } catch {
            // The disposable service may still be starting.
        }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))
    }
    throw new Error('Keycloak realm did not become ready')
}

async function main(): Promise<void> {
    const secretsFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    const credentials = JSON.parse(await readFile(secretsFile, 'utf8')) as ServiceClientCredentials
    const bffSecretsFile = resolve(process.env.KEYCLOAK_DEV_BFF_SECRETS_FILE ?? '.dev/keycloak/bff-client.json')
    const bffCredentials = JSON.parse(await readFile(bffSecretsFile, 'utf8')) as BffClientCredentials
    const retrievalUrl = process.env.OIDC_BACKCHANNEL_URL ?? credentials.issuer
    const discovery = await waitForRealm(retrievalUrl)
    if (
        discovery.issuer !== credentials.issuer ||
        discovery.authorization_endpoint !== `${credentials.issuer}/protocol/openid-connect/auth` ||
        discovery.token_endpoint !== `${retrievalUrl}/protocol/openid-connect/token` ||
        discovery.jwks_uri !== `${retrievalUrl}/protocol/openid-connect/certs`
    ) {
        throw new Error('Keycloak discovery did not preserve public identity and selected protocol routes')
    }
    const tokenResponse = await fetch(`${retrievalUrl}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
        }),
    })
    const token = (await tokenResponse.json()) as TokenResponse
    if (!tokenResponse.ok || !token.access_token) {
        throw new Error(
            `Client Credentials failed with HTTP ${tokenResponse.status}: ${token.error ?? 'unknown error'}`,
        )
    }
    const claims = decodeJwtPayload(token.access_token)
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== credentials.issuer || !audiences.includes(credentials.audience)) {
        throw new Error(`Unexpected token issuer or audience: ${JSON.stringify({ iss: claims.iss, aud: claims.aud })}`)
    }

    const callback = bffCredentials.redirectUris[0]
    const authorizationUrl = new URL(`${retrievalUrl}/protocol/openid-connect/auth`)
    authorizationUrl.search = new URLSearchParams({
        client_id: bffCredentials.clientId,
        redirect_uri: callback,
        response_type: 'code',
        scope: 'openid',
        code_challenge: 'development-smoke-test',
        code_challenge_method: 'plain',
    }).toString()
    const pkceResponse = await fetch(authorizationUrl, { redirect: 'manual' })
    const pkceDetails = `${pkceResponse.headers.get('location') ?? ''} ${await pkceResponse.text()}`
    if (!pkceDetails.includes('error=invalid_request')) {
        throw new Error(`Keycloak accepted a non-S256 PKCE request with HTTP ${pkceResponse.status}`)
    }
    console.log(`Keycloak smoke test passed for issuer ${claims.iss} and audience ${credentials.audience}`)
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
