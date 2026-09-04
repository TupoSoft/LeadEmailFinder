import { resolve } from 'node:path'
import { writeDevelopmentSecretFile } from './development-secret-file'
import { KeycloakAdminApi } from './keycloak-admin-api'
import { KeycloakProvisioner } from './provisioning'

function listFromEnvironment(name: string, fallback: string): string[] {
    return (process.env[name] ?? fallback)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
}

async function main(): Promise<void> {
    const baseUrl = process.env.KEYCLOAK_URL ?? 'http://localhost:58080'
    const api = new KeycloakAdminApi({
        baseUrl,
        username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin-development-only',
    })
    await api.authenticate()
    // The administrator may connect through the Docker network while token identity stays public.
    const publicBaseUrl = process.env.KEYCLOAK_PUBLIC_URL ?? baseUrl
    const provisioner = new KeycloakProvisioner(api, publicBaseUrl, {
        bffRedirectUris: listFromEnvironment('KEYCLOAK_BFF_REDIRECT_URIS', 'http://localhost:53000/v1/auth/callback'),
        bffPostLogoutRedirectUris: listFromEnvironment(
            'KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS',
            'http://localhost:53000/',
        ),
    })
    const { service, bff, orgAdmin } = await provisioner.provision()

    // World-readable (not 0o600 like the other secrets files here): docker/compose.smtp-dev.yaml bind-mounts
    // this file read-only into the smtp-dev-proxy-bootstrap/cleanup containers, which run as their own
    // non-root image user and need to read it.
    const secretsFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    await writeDevelopmentSecretFile(secretsFile, `${JSON.stringify(service, undefined, 2)}\n`, 0o644)

    const bffSecretsFile = resolve(process.env.KEYCLOAK_DEV_BFF_SECRETS_FILE ?? '.dev/keycloak/bff-client.json')
    await writeDevelopmentSecretFile(bffSecretsFile, `${JSON.stringify(bff, undefined, 2)}\n`, 0o600)

    const orgAdminSecretsFile = resolve(
        process.env.KEYCLOAK_DEV_ORG_ADMIN_SECRETS_FILE ?? '.dev/keycloak/org-admin-client.json',
    )
    await writeDevelopmentSecretFile(orgAdminSecretsFile, `${JSON.stringify(orgAdmin, undefined, 2)}\n`, 0o600)

    console.log(
        `Keycloak realm provisioned; development service credentials written to ${secretsFile}, BFF credentials written to ${bffSecretsFile}, and organization administration credentials written to ${orgAdminSecretsFile}`,
    )
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
