import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { bootstrapPlatformOperator, PLATFORM_OPERATOR_EMAIL, PLATFORM_OPERATOR_PASSWORD } from './platform-operator'
import { ServiceClientCredentials } from './bootstrap-service-credential'
import { KeycloakAdminApi } from './keycloak-admin-api'
import { readPreviousFixture } from './browser-seed-files'
import { loadOwnedBrowserSeedStack } from './owned-browser-seed-stack'

async function main(): Promise<void> {
    const stack = loadOwnedBrowserSeedStack()
    const serviceClientFile = resolve(process.env.KEYCLOAK_DEV_SECRETS_FILE ?? '.dev/keycloak/service-client.json')
    const { issuer } = JSON.parse(await readFile(serviceClientFile, 'utf8')) as ServiceClientCredentials

    const expectedIssuer = `${stack.keycloakUrl}/realms/lead-email-finder`
    if (issuer !== expectedIssuer)
        throw new Error('Seed credentials do not match the checkout-owned development issuer.')
    const api = new KeycloakAdminApi({
        baseUrl: stack.keycloakUrl,
        username: stack.keycloakAdminUsername,
        password: stack.keycloakAdminPassword,
    })
    await api.authenticate()

    const dataSource = new DataSource({ type: 'postgres', url: stack.postgresUrl })
    await dataSource.initialize()

    try {
        const summaryFile = resolve(process.env.KEYCLOAK_DEV_OPERATOR_FILE ?? '.dev/keycloak/platform-operator.json')
        const previous = await readPreviousFixture<{ issuer: string; email: string; subject: string }>(summaryFile)
        const { organizationId, externalIdentityId, subject } = await bootstrapPlatformOperator(api, dataSource, {
            issuer,
            email: PLATFORM_OPERATOR_EMAIL,
            password: PLATFORM_OPERATOR_PASSWORD,
            expectedIssuer,
            previousSubject:
                previous?.issuer === issuer && previous.email === PLATFORM_OPERATOR_EMAIL
                    ? previous.subject
                    : undefined,
        })

        const summary = { issuer, organizationId, externalIdentityId, subject, email: PLATFORM_OPERATOR_EMAIL }
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
