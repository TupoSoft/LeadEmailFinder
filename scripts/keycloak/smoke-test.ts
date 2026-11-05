import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BffClientCredentials } from './provisioning'

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
    const bffSecretsFile = resolve(process.env.KEYCLOAK_DEV_BFF_SECRETS_FILE ?? '.dev/keycloak/bff-client.json')
    const bffCredentials = JSON.parse(await readFile(bffSecretsFile, 'utf8')) as BffClientCredentials
    const retrievalUrl = process.env.OIDC_BACKCHANNEL_URL ?? bffCredentials.issuer
    const discovery = await waitForRealm(retrievalUrl)
    if (
        discovery.issuer !== bffCredentials.issuer ||
        discovery.authorization_endpoint !== `${bffCredentials.issuer}/protocol/openid-connect/auth` ||
        discovery.token_endpoint !== `${retrievalUrl}/protocol/openid-connect/token` ||
        discovery.jwks_uri !== `${retrievalUrl}/protocol/openid-connect/certs`
    ) {
        throw new Error('Keycloak discovery did not preserve public identity and selected protocol routes')
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
    console.log(`Keycloak smoke test passed for browser issuer ${bffCredentials.issuer}`)
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
