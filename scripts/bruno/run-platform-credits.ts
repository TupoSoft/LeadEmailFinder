import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { bootstrapServiceCredential } from '../keycloak/bootstrap-service-credential'
import { obtainClientCredentialsToken } from '../keycloak/customer-fixture'
import { KeycloakAdminApi } from '../keycloak/keycloak-admin-api'
import { REALM } from '../keycloak/provisioning'
import { assertExecutedBrunoReport, loadPlatformCreditsStack } from './platform-credits-runner'
import { createReservationBootstrapModule } from './reservation-bootstrap-module'

const HELD_RESERVATION_AMOUNT = 20
const HELD_STARTING_BALANCE = 50

const credentialSchema = z.object({
    issuer: z.string().url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
})
let phase = 'discovering the checkout-owned development stack'

async function readJson(file: string): Promise<unknown> {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
}

async function main(): Promise<void> {
    const checkoutRoot = resolve(__dirname, '../..')
    const metadata = loadPlatformCreditsStack(checkoutRoot)
    const serviceClient = credentialSchema.parse(
        await readJson(resolve(checkoutRoot, '.dev/keycloak/service-client.json')),
    )
    const customer = z
        .object({ keycloakClientId: z.string().min(1) })
        .parse(await readJson(resolve(checkoutRoot, '.dev/keycloak/customer-fixture.json')))
    if (
        new URL(serviceClient.issuer).origin !== new URL(metadata.keycloakUrl).origin ||
        new URL(serviceClient.issuer).pathname !== `/realms/${REALM}`
    ) {
        throw new Error('The platform credential issuer does not match the local Keycloak endpoint')
    }
    const cliPackageFile = require.resolve('@usebruno/cli/package.json')
    const cliPackage = z.object({ version: z.literal('4.1.0') }).parse(await readJson(cliPackageFile))
    phase = 'bootstrapping the local platform credential'
    const api = new KeycloakAdminApi({
        baseUrl: metadata.keycloakUrl,
        username: metadata.keycloakAdminUsername,
        password: metadata.keycloakAdminPassword,
    })
    await api.authenticate()
    const dataSource = new DataSource({ type: 'postgres', url: metadata.postgresUrl })
    await dataSource.initialize()
    const organizationIds = Array.from({ length: 6 }, () => randomUUID())
    const heldOrganizationId = organizationIds[5]
    const reportDirectory = await mkdtemp(resolve(tmpdir(), 'lef-platform-credits-'))
    try {
        await bootstrapServiceCredential(api, dataSource, serviceClient)
        phase = 'minting local platform and customer credentials'
        const [client] = await api.request<Array<{ id: string; clientId: string }>>(
            'GET',
            `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(customer.keycloakClientId)}`,
        )
        if (!client || client.clientId !== customer.keycloakClientId) {
            throw new Error('The seeded customer credential is unavailable')
        }
        const { value: customerSecret } = await api.request<{ value: string }>(
            'GET',
            `/admin/realms/${REALM}/clients/${client.id}/client-secret`,
        )
        const [platformToken, customerToken] = await Promise.all([
            obtainClientCredentialsToken(
                serviceClient.issuer,
                serviceClient.clientId,
                serviceClient.clientSecret,
                fetch,
            ),
            obtainClientCredentialsToken(serviceClient.issuer, customer.keycloakClientId, customerSecret, fetch),
        ])
        phase = 'creating synthetic organizations without credit accounts'
        for (const id of organizationIds) {
            await dataSource.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
                id,
                'Bruno platform credit fixture',
            ])
        }
        phase = 'funding the held organization fixture'
        const fundingResponse = await fetch(`${metadata.apiUrl}/credits/${heldOrganizationId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${platformToken}`,
                'Idempotency-Key': randomUUID(),
            },
            body: JSON.stringify({ amount: HELD_STARTING_BALANCE }),
        })
        if (!fundingResponse.ok) throw new Error('Failed to fund the held organization fixture')
        phase = 'creating a real credit reservation hold for the Bruno fixture'
        const reservationApp = await NestFactory.createApplicationContext(
            createReservationBootstrapModule(metadata.postgresUrl),
            { logger: false },
        )
        try {
            const reservationService = reservationApp.get(CreditReservationService)
            await reservationService.reserve(heldOrganizationId, {
                operationId: randomUUID(),
                amount: HELD_RESERVATION_AMOUNT,
            })
        } finally {
            await reservationApp.close()
        }
        phase = 'executing the platform credit collection'
        const reportFile = resolve(reportDirectory, 'report.json')
        execFileSync(
            process.execPath,
            [
                resolve(dirname(cliPackageFile), 'bin/bru.js'),
                'run',
                '--env',
                'local',
                '--sandbox',
                'developer',
                '--reporter-json',
                reportFile,
                '--reporter-skip-all-headers',
                '--reporter-skip-body',
            ],
            {
                cwd: resolve(checkoutRoot, 'bruno/platform-credits'),
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 120_000,
                env: {
                    ...process.env,
                    BRUNO_API_URL: metadata.apiUrl,
                    BRUNO_PLATFORM_TOKEN: platformToken,
                    BRUNO_CUSTOMER_TOKEN: customerToken,
                    BRUNO_ORGANIZATION_ID: organizationIds[0],
                    BRUNO_ABSENT_DUPLICATE_ORGANIZATION_ID: organizationIds[1],
                    BRUNO_ABSENT_DISTINCT_ORGANIZATION_ID: organizationIds[2],
                    BRUNO_ABSENT_CONFLICT_ORGANIZATION_ID: organizationIds[3],
                    BRUNO_SET_ORGANIZATION_ID: organizationIds[4],
                    BRUNO_HELD_ORGANIZATION_ID: heldOrganizationId,
                    BRUNO_UNKNOWN_ORGANIZATION_ID: randomUUID(),
                },
            },
        )
        const counts = assertExecutedBrunoReport(await readJson(reportFile), 34)
        phase = 'checking account counts, grant counts, and balances'
        for (const [index, id] of organizationIds.entries()) {
            const rows = await dataSource.query<
                Array<{ balance: number; reserved: number; grantCount: string; grantTotal: string }>
            >(
                `SELECT a.balance, a.reserved, COUNT(g.reference)::text AS "grantCount", COALESCE(SUM(g.amount), 0)::text AS "grantTotal"
                 FROM organization_credit_accounts a LEFT JOIN credit_grants g ON g."organizationId" = a."organizationId"
                 WHERE a."organizationId" = $1 GROUP BY a."organizationId", a.balance, a.reserved`,
                [id],
            )
            const allowedBalances = [[26], [13], [5], [17, 19], [0], [HELD_STARTING_BALANCE]][index]
            const expectedGrants = [4, 1, 2, 1, 0, 1][index]
            const expectedReserved = [0, 0, 0, 0, 0, HELD_RESERVATION_AMOUNT][index]
            if (
                rows.length !== 1 ||
                !allowedBalances.includes(rows[0].balance) ||
                Number(rows[0].grantCount) !== expectedGrants ||
                Number(rows[0].grantTotal) !== rows[0].balance ||
                rows[0].reserved !== expectedReserved
            ) {
                throw new Error(
                    'The synthetic ledger did not match the expected account, grant, and balance invariants',
                )
            }
            console.log(
                `Bruno fixture ${index + 1}: before=0 after=${rows[0].balance} accounts=1 grants=${expectedGrants}`,
            )
        }
        console.log(
            `Bruno ${cliPackage.version}: ${counts.requests} requests and ${counts.tests} tests passed; no skipped requests`,
        )
    } finally {
        const executionPhase = phase
        phase = 'cleaning synthetic organizations and temporary reports'
        try {
            await dataSource.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [organizationIds])
        } finally {
            await dataSource.destroy()
            await rm(reportDirectory, { recursive: true, force: true })
        }
        phase = executionPhase
    }
    console.log('Bruno synthetic organizations and temporary reports removed')
}

void main().catch(() => {
    console.error(
        `Bruno platform credits failed while ${phase}. Raw output is withheld to protect credentials and operation keys.`,
    )
    process.exitCode = 1
})
