import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
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
    const provisioner = new KeycloakProvisioner(api, baseUrl, {
        bffRedirectUris: listFromEnvironment('KEYCLOAK_BFF_REDIRECT_URIS', 'http://localhost:53000/v1/auth/callback'),
        bffPostLogoutRedirectUris: listFromEnvironment(
            'KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS',
            'http://localhost:53000/',
        ),
    })
    const { service, bff, orgAdmin } = await provisioner.provision()

    const secretsFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    await mkdir(dirname(secretsFile), { recursive: true })
    await writeFile(secretsFile, `${JSON.stringify(service, undefined, 2)}\n`, { mode: 0o600 })
    await chmod(secretsFile, 0o600)

    const bffSecretsFile = resolve(process.env.KEYCLOAK_DEV_BFF_SECRETS_FILE ?? '.dev/keycloak/bff-client.json')
    await mkdir(dirname(bffSecretsFile), { recursive: true })
    await writeFile(bffSecretsFile, `${JSON.stringify(bff, undefined, 2)}\n`, { mode: 0o600 })
    await chmod(bffSecretsFile, 0o600)

    const orgAdminSecretsFile = resolve(
        process.env.KEYCLOAK_DEV_ORG_ADMIN_SECRETS_FILE ?? '.dev/keycloak/org-admin-client.json',
    )
    await mkdir(dirname(orgAdminSecretsFile), { recursive: true })
    await writeFile(orgAdminSecretsFile, `${JSON.stringify(orgAdmin, undefined, 2)}\n`, { mode: 0o600 })
    await chmod(orgAdminSecretsFile, 0o600)

    console.log(
        `Keycloak realm provisioned; development service credentials written to ${secretsFile}, BFF credentials written to ${bffSecretsFile}, and organization administration credentials written to ${orgAdminSecretsFile}`,
    )
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
