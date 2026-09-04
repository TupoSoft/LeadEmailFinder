import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { ServiceClientCredentials } from './bootstrap-service-credential'
import { obtainClientCredentialsToken, seedCustomerFixture } from './customer-fixture'
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
        const platformToken = await obtainClientCredentialsToken(
            process.env.OIDC_BACKCHANNEL_URL ?? serviceClient.issuer,
            serviceClient.clientId,
            serviceClient.clientSecret,
            fetch,
        )

        const apiUrl = process.env.API_URL ?? 'http://localhost:53000'
        const summary = await seedCustomerFixture({
            apiUrl,
            issuer: serviceClient.issuer,
            platformToken,
            api,
            dataSource,
            fetchImpl: fetch,
        })

        const summaryFile = resolve(process.env.KEYCLOAK_DEV_CUSTOMER_FIXTURE_FILE ?? '.dev/keycloak/customer-fixture.json')
        await writeFile(summaryFile, `${JSON.stringify(summary, undefined, 2)}\n`, { mode: 0o600 })
        await chmod(summaryFile, 0o600)

        console.log(
            `Seeded customer organization ${summary.organizationId} with owner ${summary.ownerEmail} and M2M ` +
                `client ${summary.keycloakClientId} across ${summary.issuers.length} issuer(s); summary written to ${summaryFile}`,
        )
    } finally {
        await dataSource.destroy()
    }
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
