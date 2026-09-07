import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { inspectDevelopmentService, loadDevelopmentStack } from './development-stack.mjs'
import { assertPrivateTopologyLogs, sendPrivacyProbes } from './web-log-privacy.mjs'

const require = createRequire(import.meta.url)
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export function assertPassedBrowserReport(report) {
    const stats = report?.stats
    if (
        !stats ||
        stats.expected !== 6 ||
        stats.unexpected !== 0 ||
        stats.flaky !== 0 ||
        stats.skipped !== 0 ||
        report.errors?.length
    ) {
        throw new Error('Gateway browser smoke requires exactly six passing tests with zero skipped or flaky tests')
    }
    return stats.expected
}

export function browserFailureLocations(report) {
    const specs = report.suites?.flatMap(suite => suite.specs ?? []) ?? []
    return specs
        .filter(spec => !spec.ok)
        .map(spec => {
            const errors = spec.tests?.flatMap(test => test.results?.flatMap(result => result.errors ?? []) ?? []) ?? []
            const location = errors
                .map(
                    error =>
                        (error.stack ?? error.message)?.match(/((?:same-origin|auth-shell)\.spec\.ts:\d+):\d+/)?.[1],
                )
                .find(Boolean)
            const file =
                spec.file?.split('/').at(-1) === 'auth-shell.spec.ts' ? 'auth-shell.spec.ts' : 'same-origin.spec.ts'
            return location ?? `${file}:${Number.isInteger(spec.line) ? spec.line : 0}`
        })
}

export function assertFixtureTarget(metadata) {
    const database = new URL(metadata.postgresUrl)
    if (
        ![metadata.apiUrl, metadata.keycloakUrl].every(value => /^http:\/\/localhost:[0-9]+$/.test(value)) ||
        database.pathname !== '/lef'
    ) {
        throw new Error(
            'Gateway smoke requires confirmed loopback Compose ports and its disposable application database',
        )
    }
}

async function keycloakRequest(metadata, path, { token, method = 'GET', body } = {}) {
    const response = await fetch(`${metadata.keycloakUrl}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error('Transient browser fixture Keycloak request failed')
    return response
}

async function authenticateKeycloakAdmin(metadata) {
    const tokenResponse = await fetch(`${metadata.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: metadata.keycloakAdminUsername,
            password: metadata.keycloakAdminPassword,
        }),
        signal: AbortSignal.timeout(15_000),
    })
    if (!tokenResponse.ok) throw new Error('Transient browser fixture admin authentication failed')
    const { access_token: token } = await tokenResponse.json()
    if (!token) throw new Error('Transient browser fixture admin token is missing')
    return token
}

async function createMemberFixture(root, metadata, organizationId) {
    assertFixtureTarget(metadata)
    inspectDevelopmentService(root, metadata, 'keycloak', '8080/tcp', metadata.keycloakUrl)
    inspectDevelopmentService(root, metadata, 'postgres', '5432/tcp', metadata.postgresUrl)
    const token = await authenticateKeycloakAdmin(metadata)
    const fixture = {
        username: `web-smoke-${randomUUID()}@example.test`,
        password: randomBytes(24).toString('base64url'),
        organizationId: organizationId ?? randomUUID(),
        externalIdentityId: randomUUID(),
    }
    const created = await keycloakRequest(metadata, '/admin/realms/lead-email-finder/users', {
        token,
        method: 'POST',
        body: {
            username: fixture.username,
            email: fixture.username,
            firstName: 'Browser',
            lastName: 'Smoke',
            enabled: true,
            emailVerified: true,
            requiredActions: [],
            credentials: [{ type: 'password', value: fixture.password, temporary: false }],
        },
    })
    const subject = new URL(created.headers.get('location')).pathname.split('/').at(-1)
    if (!uuidPattern.test(subject ?? '')) throw new Error('Transient browser fixture has no valid Keycloak subject')
    const client = new pg.Client({ connectionString: metadata.postgresUrl })
    let connected = false
    const cleanup = async () => {
        try {
            if (connected) {
                inspectDevelopmentService(root, metadata, 'postgres', '5432/tcp', metadata.postgresUrl)
                await client.query('BEGIN')
                await client.query('DELETE FROM organization_memberships WHERE "externalIdentityId" = $1', [
                    fixture.externalIdentityId,
                ])
                if (!organizationId)
                    await client.query('DELETE FROM organizations WHERE id = $1', [fixture.organizationId])
                await client.query('DELETE FROM external_identities WHERE id = $1', [fixture.externalIdentityId])
                await client.query('COMMIT')
            }
        } finally {
            await client.end()
            inspectDevelopmentService(root, metadata, 'keycloak', '8080/tcp', metadata.keycloakUrl)
            await keycloakRequest(metadata, `/admin/realms/lead-email-finder/users/${subject}`, {
                token: await authenticateKeycloakAdmin(metadata),
                method: 'DELETE',
            })
        }
    }
    try {
        await client.connect()
        connected = true
        await client.query('BEGIN')
        if (!organizationId) {
            await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
                fixture.organizationId,
                'Gateway browser smoke',
            ])
        }
        await client.query('INSERT INTO external_identities (id, issuer, subject, email) VALUES ($1, $2, $3, $4)', [
            fixture.externalIdentityId,
            `${metadata.keycloakUrl}/realms/lead-email-finder`,
            subject,
            fixture.username,
        ])
        await client.query(
            'INSERT INTO organization_memberships ("organizationId", "externalIdentityId", role, status) VALUES ($1, $2, $3, $4)',
            [fixture.organizationId, fixture.externalIdentityId, 'member', 'active'],
        )
        await client.query('COMMIT')
        return { fixture, cleanup }
    } catch (error) {
        if (connected) await client.query('ROLLBACK')
        await cleanup()
        throw error
    }
}

async function bundleBrowserClient(root, target) {
    const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [resolve(root, 'apps/web')] })).href)
    const result = await build({
        configFile: false,
        root: resolve(root, 'apps/web'),
        logLevel: 'silent',
        build: {
            write: false,
            lib: {
                entry: resolve(root, 'apps/web/src/api/browser-api-client.ts'),
                name: 'gatewayClient',
                formats: ['iife'],
            },
        },
    })
    const output = (Array.isArray(result) ? result[0] : result).output.find(entry => entry.type === 'chunk')
    if (!output?.code) throw new Error('Browser transport fixture bundle is missing')
    writeFileSync(target, `${output.code}\nwindow.gatewayClient = gatewayClient;\n`, { mode: 0o600 })
}

export async function runWebLive() {
    const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
    const metadata = loadDevelopmentStack(root)
    assertFixtureTarget(metadata)
    const origin = metadata.apiUrl
    const web = inspectDevelopmentService(root, metadata, 'web', '8080/tcp', origin)
    const api = inspectDevelopmentService(root, metadata, 'api')
    for (const service of [web, api]) {
        if (service.container.State.Health?.Status !== 'healthy')
            throw new Error('Gateway smoke requires healthy web and API services')
    }
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-web-live-'))
    let member
    let replacement
    try {
        member = await createMemberFixture(root, metadata)
        replacement = await createMemberFixture(root, metadata, member.fixture.organizationId)
        const fixturePath = resolve(directory, 'fixture.json')
        const clientBundle = resolve(directory, 'browser-client.js')
        const reportPath = resolve(directory, 'report.json')
        await bundleBrowserClient(root, clientBundle)
        inspectDevelopmentService(root, metadata, 'redis', '6379/tcp', metadata.redisUrl)
        writeFileSync(
            fixturePath,
            JSON.stringify({
                ...member.fixture,
                replacement: replacement.fixture,
                clientBundle,
                redisUrl: metadata.redisUrl,
            }),
            { mode: 0o600 },
        )
        const since = new Date().toISOString()
        const probes = await sendPrivacyProbes(origin)
        const result = spawnSync(
            'corepack',
            [
                'pnpm',
                '--filter',
                '@tuposoft/lead-email-finder-web',
                'exec',
                'playwright',
                'test',
                '--config=playwright.gateway.config.ts',
            ],
            {
                cwd: root,
                env: {
                    ...process.env,
                    WEB_LIVE_ORIGIN: origin,
                    WEB_LIVE_KEYCLOAK_ORIGIN: metadata.keycloakUrl,
                    WEB_LIVE_FIXTURE: fixturePath,
                    WEB_LIVE_REPORT: reportPath,
                    WEB_LIVE_OUTPUT: resolve(directory, 'results'),
                },
                encoding: 'utf8',
                timeout: 420_000,
                maxBuffer: 20 * 1024 * 1024,
            },
        )
        // Raw Playwright output can contain callback URLs or cookies on failure. Keep it private and ephemeral.
        if (result.error || result.status !== 0) {
            if (result.error) throw new Error('Gateway browser command failed to execute')
            const report = JSON.parse(readFileSync(reportPath, 'utf8'))
            process.stderr.write(
                `Gateway browser failure at ${browserFailureLocations(report).join(', ')}; sensitive diagnostics withheld.\n`,
            )
            throw new Error('Gateway browser execution failed')
        }
        const count = assertPassedBrowserReport(JSON.parse(readFileSync(reportPath, 'utf8')))
        const logs = Object.fromEntries(
            [
                ['web', web],
                ['api', api],
            ].map(([name, service]) => {
                const output = spawnSync('docker', ['logs', '--since', since, service.id], {
                    cwd: root,
                    encoding: 'utf8',
                    timeout: 30_000,
                    maxBuffer: 20 * 1024 * 1024,
                })
                if (output.error || output.status !== 0) throw new Error('Gateway privacy log capture failed')
                return [name, `${output.stdout}\n${output.stderr}`]
            }),
        )
        assertPrivateTopologyLogs(logs, probes)
        process.stdout.write(
            `Gateway live: ${count} browser tests passed; real Keycloak cookie/CSRF flow and both log privacy boundaries passed.\n`,
        )
    } finally {
        try {
            try {
                await replacement?.cleanup()
            } finally {
                await member?.cleanup()
            }
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runWebLive().catch(error => {
        // Error messages below contain only our own static text; provider/SQL/Playwright diagnostics stay private.
        process.stderr.write(
            `Gateway live validation failed (${error instanceof Error && error.message.startsWith('Gateway') ? error.message : 'fixture or privacy check'}); raw output withheld to protect credentials.\n`,
        )
        process.exitCode = 1
    })
}
