import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { bootstrapServiceCredential, PLATFORM_ORGANIZATION_NAME, ServiceClientCredentials } from './bootstrap-service-credential'
import { KeycloakAdminApi } from './keycloak-admin-api'

async function main(): Promise<void> {
    const serviceClientFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    const serviceClient = JSON.parse(await readFile(serviceClientFile, 'utf8')) as ServiceClientCredentials

    const baseUrl = process.env.KEYCLOAK_URL ?? 'http://localhost:58080'
    const api = new KeycloakAdminApi({
        baseUrl,
        username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin-development-only',
    })
    await api.authenticate()

    const postgresUrl = process.env.POSTGRES_URL
    if (!postgresUrl) {
        throw new Error('POSTGRES_URL is required (the same value the api service uses)')
    }
    const dataSource = new DataSource({ type: 'postgres', url: postgresUrl })
    await dataSource.initialize()

    try {
        const { organizationId, subject, seeds } = await bootstrapServiceCredential(api, dataSource, serviceClient)

        const summaryFile = resolve(process.env.KEYCLOAK_DEV_BOOTSTRAP_FILE ?? '.dev/keycloak/service-credential.json')
        const summary = {
            organizationId,
            subject,
            keycloakClientId: serviceClient.clientId,
            issuers: seeds.map(seed => seed.issuer),
        }
        await writeFile(summaryFile, `${JSON.stringify(summary, undefined, 2)}\n`, { mode: 0o600 })
        await chmod(summaryFile, 0o600)

        console.log(
            `Seeded organization "${PLATFORM_ORGANIZATION_NAME}" (${organizationId}) with a platform:admin ` +
                `service credential for ${serviceClient.clientId} across ${seeds.length} issuer(s); summary written to ${summaryFile}`,
        )
    } finally {
        await dataSource.destroy()
    }
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
