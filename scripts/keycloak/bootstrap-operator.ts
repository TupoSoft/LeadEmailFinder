import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { bootstrapPlatformOperator, PLATFORM_OPERATOR_EMAIL, PLATFORM_OPERATOR_PASSWORD } from './platform-operator'
import { ServiceClientCredentials } from './bootstrap-service-credential'
import { KeycloakAdminApi } from './keycloak-admin-api'

async function main(): Promise<void> {
    const serviceClientFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    const { issuer } = JSON.parse(await readFile(serviceClientFile, 'utf8')) as ServiceClientCredentials

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
        const { organizationId, externalIdentityId, subject } = await bootstrapPlatformOperator(api, dataSource, {
            issuer,
            email: PLATFORM_OPERATOR_EMAIL,
            password: PLATFORM_OPERATOR_PASSWORD,
        })

        const summaryFile = resolve(process.env.KEYCLOAK_DEV_OPERATOR_FILE ?? '.dev/keycloak/platform-operator.json')
        const summary = { organizationId, externalIdentityId, subject, email: PLATFORM_OPERATOR_EMAIL }
        await writeFile(summaryFile, `${JSON.stringify(summary, undefined, 2)}\n`, { mode: 0o600 })
        await chmod(summaryFile, 0o600)

        console.log(
            `Seeded platform operator ${PLATFORM_OPERATOR_EMAIL} (${subject}) as platform_admin in organization ` +
                `${organizationId}; summary written to ${summaryFile}. Password is the fixed dev-only constant ` +
                `PLATFORM_OPERATOR_PASSWORD in scripts/keycloak/platform-operator.ts.`,
        )
    } finally {
        await dataSource.destroy()
    }
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
