import { chmod, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { bootstrapDevelopmentApiKey } from './bootstrap-service-credential'
import { CustomerFixtureSummary, seedCustomerFixture } from './customer-fixture'
import { KeycloakAdminApi } from './keycloak-admin-api'
import { createBrowserSeedMetadata } from './browser-fixture-seed'
import { PLATFORM_OPERATOR_EMAIL } from './browser-fixture-identities'
import { readPreviousFixture, writeBrowserSeedMetadata } from './browser-seed-files'
import { loadOwnedBrowserSeedStack } from './owned-browser-seed-stack'

async function main(): Promise<void> {
    const stack = loadOwnedBrowserSeedStack()

    const expectedIssuer = `${stack.keycloakUrl}/realms/lead-email-finder`
    const api = new KeycloakAdminApi({
        baseUrl: stack.keycloakUrl,
        username: stack.keycloakAdminUsername,
        password: stack.keycloakAdminPassword,
    })
    await api.authenticate()

    const dataSource = new DataSource({ type: 'postgres', url: stack.postgresUrl })
    await dataSource.initialize()

    try {
        const summaryFile = resolve(
            process.env.KEYCLOAK_DEV_CUSTOMER_FIXTURE_FILE ?? '.dev/keycloak/customer-fixture.json',
        )
        const previousFixture = await readPreviousFixture<CustomerFixtureSummary>(summaryFile)
        const operator = await readPreviousFixture<{ issuer: string; email: string; subject: string }>(
            resolve(process.env.KEYCLOAK_DEV_OPERATOR_FILE ?? '.dev/keycloak/platform-operator.json'),
        )
        if (operator?.issuer !== expectedIssuer || operator.email !== PLATFORM_OPERATOR_EMAIL || !operator.subject) {
            throw new Error('Matching platform operator seed metadata is required before seeding browser fixtures.')
        }
        const platform = await bootstrapDevelopmentApiKey('platform')

        const summary = await seedCustomerFixture({
            apiUrl: stack.apiUrl,
            issuer: expectedIssuer,
            platformToken: platform.apiKey,
            api,
            dataSource,
            fetchImpl: fetch,
            previousFixture,
            expectedIssuer,
            seedApiKey: organizationId => bootstrapDevelopmentApiKey('customer', organizationId),
        })

        await writeFile(summaryFile, `${JSON.stringify(summary, undefined, 2)}\n`, { mode: 0o600 })
        await chmod(summaryFile, 0o600)
        await writeBrowserSeedMetadata(
            resolve('.dev/keycloak/browser-seed.json'),
            createBrowserSeedMetadata(
                { owner: summary.ownerSubject, platformOperator: operator.subject },
                expectedIssuer,
            ),
        )

        console.log(
            `Seeded customer organization ${summary.organizationId} with owner ${summary.ownerEmail} and M2M ` +
                `API key ${summary.keyPrefix} across ${summary.issuers.length} issuer(s); summary written to ${summaryFile}`,
        )
    } finally {
        await dataSource.destroy()
    }
}

void main().catch(() => {
    console.error('Customer fixture seed failed; raw output withheld to protect credentials')
    process.exitCode = 1
})
