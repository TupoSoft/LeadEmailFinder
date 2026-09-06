import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectDevelopmentService, loadDevelopmentStack, runDevelopmentCommand } from './development-stack.mjs'

export const REQUIRED_BFF_INPUTS = [
    'TEST_BFF_ISSUER_URL',
    'TEST_BFF_CLIENT_ID',
    'TEST_BFF_CLIENT_SECRET',
    'TEST_BFF_POSTGRES_URL',
    'TEST_BFF_REDIS_URL',
    'TEST_BFF_KEYCLOAK_ADMIN_USERNAME',
    'TEST_BFF_KEYCLOAK_ADMIN_PASSWORD',
]

export function validateBffInputs(inputs) {
    for (const key of REQUIRED_BFF_INPUTS) {
        if (typeof inputs[key] !== 'string' || !inputs[key].trim())
            throw new Error(`BFF live prerequisite missing: ${key}`)
    }
    let database
    try {
        database = new URL(inputs.TEST_BFF_POSTGRES_URL)
    } catch {
        throw new Error('Invalid BFF live PostgreSQL configuration')
    }
    if (
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        database.pathname !== '/bff_session_test' ||
        database.hostname !== 'postgres' ||
        database.port !== '5432' ||
        database.username !== 'postgres' ||
        !database.password ||
        database.search ||
        database.hash
    ) {
        throw new Error(
            'BFF live PostgreSQL must use only the dedicated Compose bff_session_test database ending in _test',
        )
    }
    let issuer
    let backchannel
    let jwks
    let redis
    let appBaseUrl
    try {
        issuer = new URL(inputs.TEST_BFF_ISSUER_URL)
        backchannel = new URL(inputs.TEST_BFF_BACKCHANNEL_URL)
        jwks = new URL(inputs.TEST_BFF_JWKS_URI)
        redis = new URL(inputs.TEST_BFF_REDIS_URL)
        appBaseUrl = new URL(inputs.TEST_BFF_APP_BASE_URL ?? 'http://localhost:53000')
    } catch {
        throw new Error('Invalid BFF live provider or Redis configuration')
    }
    if (
        issuer.protocol !== 'http:' ||
        issuer.hostname !== 'localhost' ||
        !issuer.port ||
        Number(issuer.port) === 0 ||
        issuer.pathname !== '/realms/lead-email-finder' ||
        issuer.username ||
        issuer.password ||
        issuer.search ||
        issuer.hash ||
        appBaseUrl.protocol !== 'http:' ||
        appBaseUrl.hostname !== 'localhost' ||
        !appBaseUrl.port ||
        Number(appBaseUrl.port) === 0 ||
        appBaseUrl.origin !== (inputs.TEST_BFF_APP_BASE_URL ?? 'http://localhost:53000') ||
        backchannel.href !== 'http://keycloak:8080/realms/lead-email-finder' ||
        jwks.href !== `${backchannel.href}/protocol/openid-connect/certs` ||
        redis.href !== 'redis://redis:6379'
    ) {
        throw new Error('BFF live inputs must retain the public issuer and separate Compose provider routes')
    }
    return inputs
}

export function passedBffTests(report) {
    if (
        !report ||
        report.success !== true ||
        !Number.isInteger(report.numPassedTests) ||
        report.numPassedTests <= 0 ||
        report.numTotalTests !== report.numPassedTests ||
        report.numPendingTests !== 0 ||
        report.numFailedTests !== 0 ||
        report.numFailedTestSuites !== 0 ||
        report.numPendingTestSuites !== 0 ||
        report.numTotalTestSuites !== 1 ||
        report.numPassedTestSuites !== 1
    ) {
        throw new Error('BFF live suite failed, skipped tests, or executed zero tests')
    }
    return report.numPassedTests
}

export function buildBffInputs(metadata, credentials) {
    if (
        !credentials ||
        credentials.issuer !== `${metadata.keycloakUrl}/realms/lead-email-finder` ||
        credentials.clientId !== 'lef-web-bff'
    )
        throw new Error('BFF client metadata does not match the confirmed Keycloak service')
    const postgres = new URL(metadata.postgresUrl)
    postgres.hostname = 'postgres'
    postgres.port = '5432'
    postgres.pathname = '/bff_session_test'
    return validateBffInputs({
        TEST_BFF_ISSUER_URL: credentials.issuer,
        TEST_BFF_APP_BASE_URL: metadata.apiUrl,
        TEST_BFF_CLIENT_ID: credentials.clientId,
        TEST_BFF_CLIENT_SECRET: credentials.clientSecret,
        TEST_BFF_POSTGRES_URL: postgres.toString(),
        TEST_BFF_REDIS_URL: 'redis://redis:6379',
        TEST_BFF_KEYCLOAK_ADMIN_USERNAME: metadata.keycloakAdminUsername,
        TEST_BFF_KEYCLOAK_ADMIN_PASSWORD: metadata.keycloakAdminPassword,
        TEST_BFF_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder',
        TEST_BFF_JWKS_URI: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
        TEST_BFF_EXPECT_PUBLIC_UNREACHABLE: 'true',
    })
}

export function runBffLive() {
    const checkoutRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
    const metadata = loadDevelopmentStack(checkoutRoot)
    const credentials = JSON.parse(readFileSync(resolve(checkoutRoot, '.dev/keycloak/bff-client.json'), 'utf8'))
    const inputs = buildBffInputs(metadata, credentials)
    // Confirm live labels again immediately before creating the only database this command can target.
    const postgres = inspectDevelopmentService(checkoutRoot, metadata, 'postgres', '5432/tcp', metadata.postgresUrl)
    const api = inspectDevelopmentService(checkoutRoot, metadata, 'api')
    inspectDevelopmentService(checkoutRoot, metadata, 'web', '8080/tcp', metadata.apiUrl)
    const exists = runDevelopmentCommand(
        'docker',
        [
            'exec',
            postgres.id,
            'psql',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-Atc',
            "SELECT 1 FROM pg_database WHERE datname = 'bff_session_test'",
        ],
        { cwd: checkoutRoot },
    )
    if (exists === '') {
        runDevelopmentCommand('docker', ['exec', postgres.id, 'createdb', '-U', 'postgres', 'bff_session_test'], {
            cwd: checkoutRoot,
        })
    } else if (exists !== '1') throw new Error('Unexpected dedicated BFF live database state')
    // Secrets cross stdin, never the command line; the child deletes its potentially sensitive Jest report.
    const report = JSON.parse(
        runDevelopmentCommand(
            'docker',
            ['exec', '-i', '-w', '/app', api.id, 'node', 'scripts/testing/bff-live-child.mjs'],
            { cwd: checkoutRoot, input: JSON.stringify(inputs), timeout: 300_000 },
        ),
    )
    const count = passedBffTests(report)
    process.stdout.write(
        `BFF live: ${count} tests passed; zero skipped; public issuer, internal token/refresh/logout/JWKS routes.\n`,
    )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        runBffLive()
    } catch {
        process.stderr.write(
            'BFF live validation failed. Confirm this checkout development stack and provisioned BFF client; raw output withheld to protect credentials.\n',
        )
        process.exitCode = 1
    }
}
