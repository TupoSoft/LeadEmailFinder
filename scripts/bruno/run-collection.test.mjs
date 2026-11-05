import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
    assertExecutedReport,
    cliArguments,
    collectionEnvironment,
    composeWorker,
    executeCollection,
    registeredCollection,
    runCollection,
    stubPaymentEnvironment,
} from './run-collection.mjs'

const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const metadata = {
    checkoutRoot,
    composeProject: 'lef-test',
    apiUrl: 'http://localhost:53000',
    keycloakUrl: 'http://localhost:58080',
}
const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
const serviceClient = {
    version: 1,
    kind: 'platform',
    checkoutRoot,
    composeProject: metadata.composeProject,
    issuer: 'urn:lead-email-finder:auth',
    apiKey: 'lef_' + 'a'.repeat(43),
    keyPrefix: 'lef_' + 'a'.repeat(8),
    organizationId: '2ea277e5-954a-4c3d-9464-cfbb0b2e1779',
    credentialId: randomUUID(),
}
const serviceCredential = serviceClient

function report() {
    return [
        {
            summary: {
                totalRequests: 1,
                passedRequests: 1,
                failedRequests: 0,
                errorRequests: 0,
                skippedRequests: 0,
                totalTests: 1,
                passedTests: 1,
                failedTests: 0,
                failedAssertions: 0,
            },
            results: [{ testResults: [{ status: 'pass' }] }],
        },
    ]
}

test('accepts only an exact registered collection with no extra command arguments', async () => {
    assert.equal(registeredCollection('bff-sessions').network, 'host')
    assert.equal(registeredCollection('bff-sessions').requests, 15)
    assert.equal(registeredCollection('bff-sessions').tests, 16)
    assert.equal(registeredCollection('smtp-dev').network, 'compose')
    for (const name of ['../smtp-dev', '/tmp/collection', 'constructor', '__proto__', 'unknown']) {
        assert.throws(() => registeredCollection(name), /registered/)
    }
    await assert.rejects(runCollection([], checkoutRoot), /exactly one/)
    await assert.rejects(runCollection(['bff-sessions', '--sandbox=developer'], checkoutRoot), /exactly one/)
})

test('SMTP report validation requires every checked-in request', async () => {
    const files = await readdir(resolve(checkoutRoot, 'bruno/smtp-dev'))
    const requests = files.filter(file => /^\d{2}-.+\.yml$/.test(file)).sort()
    assert.equal(registeredCollection('smtp-dev').requests, requests.length)
    const sequence = await Promise.all(
        requests.map(async file => {
            const request = parseYaml(await readFile(resolve(checkoutRoot, 'bruno/smtp-dev', file), 'utf8'))
            return request.info.seq
        }),
    )
    assert.deepEqual(
        sequence,
        Array.from({ length: requests.length }, (_, index) => index + 1),
    )
})

test('credit-purchase report validation requires every checked-in request', async () => {
    const files = await readdir(resolve(checkoutRoot, 'bruno/credit-purchases'))
    const requests = files.filter(file => /^\d{2}-.+\.yml$/.test(file))
    assert.equal(registeredCollection('credit-purchases').requests, requests.length)
    assert.equal(registeredCollection('credit-purchases').sandbox, 'developer')
})

test('credit-purchase signing secret stays in the environment and the runner rejects incomplete prerequisites', () => {
    const environment = {
        ...collectionEnvironment('credit-purchases', metadata, serviceClient, serviceCredential),
        PAYMENTS_STUB_WEBHOOK_SECRET: 'synthetic-webhook-key',
        CUSTOMER_BILLING_TOKEN: 'synthetic-customer-token',
        CUSTOMER_HELD_BALANCE: '500',
        CUSTOMER_HELD_RESERVED: '75',
    }
    assert.equal(environment.PLATFORM_ORGANIZATION_ID, serviceCredential.organizationId)
    const args = cliArguments('credit-purchases', environment, '/tmp/report.json')
    assert.deepEqual(args.slice(0, 5), ['run', '--env', 'local', '--sandbox', 'developer'])
    assert.ok(!JSON.stringify(args).includes(environment.PAYMENTS_STUB_WEBHOOK_SECRET))
    for (const key of [
        'PAYMENTS_STUB_WEBHOOK_SECRET',
        'PLATFORM_ORGANIZATION_ID',
        'CUSTOMER_BILLING_TOKEN',
        'CUSTOMER_HELD_BALANCE',
        'CUSTOMER_HELD_RESERVED',
    ]) {
        assert.throws(
            () => cliArguments('credit-purchases', { ...environment, [key]: '' }, '/tmp/report'),
            /prerequisites/,
        )
    }
})

test('stub configuration must match the confirmed browser origin and provide its configured secret', async () => {
    const config = overrides => ({
        Config: {
            Env: Object.entries({
                PAYMENTS_PROVIDER: 'stub',
                PAYMENTS_CHECKOUT_URL: `${metadata.apiUrl}/billing/complete`,
                PAYMENTS_STUB_WEBHOOK_SECRET: 'synthetic-key',
                ...overrides,
            }).map(([key, value]) => `${key}=${value}`),
        },
    })
    assert.deepEqual(await stubPaymentEnvironment(config({}), checkoutRoot, metadata.apiUrl), {
        PAYMENTS_STUB_WEBHOOK_SECRET: 'synthetic-key',
    })
    for (const values of [
        { PAYMENTS_PROVIDER: 'paddle' },
        { PAYMENTS_CHECKOUT_URL: 'https://unrelated.example/billing/complete' },
        { PAYMENTS_CHECKOUT_URL: `${metadata.apiUrl}/other` },
        { PAYMENTS_CHECKOUT_URL: 'invalid' },
        { PAYMENTS_STUB_WEBHOOK_SECRET: '' },
        { PAYMENTS_STUB_WEBHOOK_SECRET_FILE: '/unmounted-secret' },
    ]) {
        await assert.rejects(stubPaymentEnvironment(config(values), checkoutRoot, metadata.apiUrl))
    }
})

test('pinned CLI executes all billing scripts, signatures, and rejection assertions against a synthetic server', async () => {
    let balance = 17
    let baseUrl
    const purchases = []
    const events = new Set()
    const secret = 'synthetic-collection-signing-key'
    const pack = { id: 'starter', credits: 100, amountMinor: 500, currency: 'USD' }
    const server = createServer(async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { 'content-type': 'application/json' })
            response.end(JSON.stringify(body))
        }
        const pathname = new URL(request.url, baseUrl).pathname
        if (pathname.endsWith('/protocol/openid-connect/token')) return reply(200, { access_token: 'synthetic-token' })
        let raw = ''
        for await (const chunk of request) raw += chunk
        if (pathname === '/v1/payments/webhook') {
            if (request.headers['paddle-signature'] !== createHmac('sha256', secret).update(raw).digest('hex'))
                return reply(400, {})
            const event = JSON.parse(raw)
            if (
                (event.kind === 'purchase_paid' && !event.providerTotalMinor) ||
                (event.kind.startsWith('purchase_adjustment') && typeof event.isFull !== 'boolean')
            )
                return reply(500, {})
            const purchase = purchases.find(row => `stub_${row.id}` === event.providerReference)
            if (!purchase) return reply(400, {})
            if (!events.has(event.providerEventId)) {
                events.add(event.providerEventId)
                if (event.kind === 'purchase_paid') {
                    balance += 100
                    purchase.status = 'paid'
                }
                if (event.kind === 'purchase_failed') purchase.status = 'failed'
                if (event.kind === 'purchase_adjustment_debit') balance -= 100
                if (event.kind === 'purchase_adjustment_restore') balance += 100
            }
            return reply(200, { received: true })
        }
        if (!request.headers.authorization) return reply(401, {})
        if (pathname === '/v1/billing/summary') {
            if (request.headers.authorization === 'Bearer synthetic-customer-token') {
                return reply(200, { balance: 500, reserved: 75, available: 425 })
            }
            return reply(200, { balance, reserved: 0, available: balance })
        }
        if (pathname === '/v1/billing/credit-packs') return reply(200, [pack])
        if (pathname === '/v1/credit-purchases' && request.method === 'GET') return reply(200, [...purchases].reverse())
        if (pathname === '/v1/credit-purchases' && request.method === 'POST') {
            const input = JSON.parse(raw)
            if (input.packId !== 'starter') return reply(400, {})
            const id = randomUUID()
            const now = new Date().toISOString()
            purchases.push({
                id,
                packId: pack.id,
                credits: pack.credits,
                amountMinor: pack.amountMinor,
                currency: pack.currency,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            })
            return reply(201, { id, status: 'pending', redirectUrl: `${baseUrl}/billing/complete?purchaseId=${id}` })
        }
        return reply(404, {})
    })
    await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    try {
        const counts = await executeCollection(
            'credit-purchases',
            {
                BRUNO_API_URL: baseUrl,
                OIDC_ISSUER_URL: baseUrl,
                PLATFORM_API_KEY: 'synthetic-client-key',
                PLATFORM_ORGANIZATION_ID: serviceCredential.organizationId,
                PAYMENTS_STUB_WEBHOOK_SECRET: secret,
                CUSTOMER_BILLING_TOKEN: 'synthetic-customer-token',
                CUSTOMER_HELD_BALANCE: '500',
                CUSTOMER_HELD_RESERVED: '75',
            },
            checkoutRoot,
        )
        assert.deepEqual(counts, { requests: 34, tests: 34 })
        assert.equal(balance, 117)
        assert.deepEqual(
            purchases.map(row => row.status),
            ['paid', 'failed'],
        )
    } finally {
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
    }
})

test('uses host or Compose API endpoints with the same checkout-owned Bearer key', () => {
    const host = collectionEnvironment('bff-sessions', metadata, serviceClient)
    assert.equal(host.BRUNO_API_URL, metadata.apiUrl)
    const internal = collectionEnvironment('smtp-dev', metadata, serviceClient)
    assert.equal(internal.BRUNO_API_URL, 'http://api:3000')
    assert.equal(host.PLATFORM_API_KEY, serviceClient.apiKey)
    assert.equal(internal.PLATFORM_API_KEY, serviceClient.apiKey)
    assert.equal(Object.hasOwn(internal, 'OIDC_BACKCHANNEL_URL'), false)
})

test('rejects missing or mismatched fixture metadata without exposing its values', () => {
    for (const fixture of [
        undefined,
        { ...serviceClient, issuer: issuer },
        { ...serviceClient, checkoutRoot: '/another-checkout' },
        { ...serviceClient, composeProject: 'foreign' },
        { ...serviceClient, organizationId: 'not-a-uuid' },
        { ...serviceClient, apiKey: '' },
    ]) {
        assert.throws(
            () => collectionEnvironment('bff-sessions', metadata, fixture),
            error => {
                assert.match(error.message, /checkout-owned/)
                assert.ok(!error.message.includes(serviceClient.apiKey))
                return true
            },
        )
    }
})

test('API-key collections always use developer sandbox and credentials never enter arguments', () => {
    const environment = collectionEnvironment('smtp-dev', metadata, serviceClient, serviceCredential)
    const args = cliArguments('smtp-dev', environment, '/tmp/report.json')
    assert.deepEqual(args.slice(0, 5), ['run', '--env', 'local', '--sandbox', 'developer'])
    assert.ok(args.includes('--reporter-skip-all-headers'))
    assert.ok(args.includes('--reporter-skip-body'))
    assert.ok(!JSON.stringify(args).includes(serviceClient.apiKey))
    assert.ok(!composeWorker.includes(serviceClient.apiKey))
    assert.throws(
        () => cliArguments('smtp-dev', { ...environment, PLATFORM_API_KEY: '' }, '/tmp/report'),
        /prerequisites/,
    )
    const bffEnvironment = collectionEnvironment('bff-sessions', metadata, serviceClient, serviceCredential)
    assert.equal(cliArguments('bff-sessions', bffEnvironment, '/tmp/report')[4], 'developer')
    assert.ok(
        !JSON.stringify(cliArguments('bff-sessions', bffEnvironment, '/tmp/report')).includes(serviceClient.apiKey),
    )
    assert.throws(
        () => cliArguments('bff-sessions', { ...bffEnvironment, PLATFORM_API_KEY: '' }, '/tmp/report'),
        /prerequisites/,
    )
})

test('requires every registered request and a nonzero passing test count', () => {
    assert.deepEqual(assertExecutedReport(report(), 1, 1), { requests: 1, tests: 1 })
    for (const invalid of [[], [{ summary: { totalRequests: 0, totalTests: 0 }, results: [] }]]) {
        assert.throws(() => assertExecutedReport(invalid, 1))
    }
    assert.throws(() => assertExecutedReport(report(), 2))
    assert.throws(() => assertExecutedReport(report(), 1, 2))
})

test('rejects skipped, failed, and mismatched report counts even after a successful process exit', () => {
    for (const field of ['skippedRequests', 'failedRequests', 'errorRequests', 'failedTests', 'failedAssertions']) {
        const value = report()
        value[0].summary[field] = 1
        assert.throws(() => assertExecutedReport(value, 1))
    }
    const [successful] = report()
    for (const value of [
        { ...successful, skipped: true },
        { ...successful, results: [{ skipped: true, testResults: [{ status: 'pass' }] }] },
        { ...successful, results: [{ error: 'failure', testResults: [{ status: 'pass' }] }] },
        { ...successful, results: [{ testResults: [{ status: 'skip' }] }] },
        { ...successful, summary: { ...successful.summary, totalTests: 2, passedTests: 2 } },
    ])
        assert.throws(() => assertExecutedReport([value], 1))
})

test('pinned CLI executes the real BFF collection and deletes reports on success and failure', async () => {
    const browserContract = await readFile(
        resolve(checkoutRoot, 'packages/api-client/openapi/lead-email-finder.json'),
        'utf8',
    )
    let wrongIssuer = false
    let pendingStateAvailable = false
    let baseUrl
    const server = createServer((request, response) => {
        if (request.url === '/docs') {
            response.writeHead(200, { 'content-type': 'text/html' })
            response.end('<html><body><div id="swagger-ui"></div></body></html>')
            return
        }
        if (request.url === '/openapi.json') {
            response.writeHead(200, { 'content-type': 'application/json' })
            response.end(browserContract)
            return
        }
        if (request.url === '/realms/lead-email-finder/protocol/openid-connect/token') {
            response.writeHead(200, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ access_token: 'synthetic-service-client-token' }))
            return
        }
        if (request.url === '/' || request.url === '/not-real') {
            response.writeHead(200, {
                'content-type': 'text/html',
                'x-content-type-options': 'nosniff',
                'x-frame-options': 'DENY',
                'cache-control': 'no-cache',
                'referrer-policy': 'strict-origin-when-cross-origin',
                'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            })
            response.end('<!doctype html><div id="root"></div>')
            return
        }
        if (request.url === '/docs-json' || request.url === '/docs-yaml' || request.url.includes('/not-real')) {
            response.writeHead(404, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ statusCode: 404 }))
            return
        }
        if (new URL(request.url, baseUrl).pathname === '/v1/auth/login') {
            pendingStateAvailable = true
            const url = new URL(
                `${
                    wrongIssuer
                        ? 'http://keycloak:8080/realms/lead-email-finder'
                        : `${baseUrl}/realms/lead-email-finder`
                }/protocol/openid-connect/auth`,
            )
            for (const [key, value] of Object.entries({
                response_type: 'code',
                client_id: 'lef-web-bff',
                code_challenge_method: 'S256',
                code_challenge: 'test-challenge',
                state: 'test-state',
                nonce: 'test-nonce',
                redirect_uri: `${baseUrl}/v1/auth/callback`,
            }))
                url.searchParams.set(key, value)
            response.writeHead(302, {
                location: url.toString(),
                'set-cookie': [
                    'lef_login_state=test-state; Max-Age=600; Path=/v1/auth; HttpOnly; SameSite=Lax',
                    'lef_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
                    'lef_csrf_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax',
                ],
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end('{}')
            return
        }
        if (request.url === '/v1/auth/callback?state=test-state') {
            if (request.headers.cookie !== 'lef_login_state=test-state' || !pendingStateAvailable) {
                response.writeHead(500).end()
                return
            }
            pendingStateAvailable = false
            response.writeHead(302, {
                location: `${baseUrl}/auth/error?code=authorization_code_exchange_failed`,
                'set-cookie':
                    'lef_login_state=; Path=/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end()
            return
        }
        if (request.url === '/v1/auth/callback?code=synthetic-code') {
            if (!pendingStateAvailable) {
                response.writeHead(500).end()
                return
            }
            response.writeHead(302, {
                location: `${baseUrl}/auth/error?code=login_state_invalid`,
                'set-cookie':
                    'lef_login_state=; Path=/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end()
            return
        }
        if (request.url === '/v1/auth/callback?code=synthetic-code&state=test-state') {
            const isMismatch = request.headers.cookie === 'lef_login_state=mismatched-state'
            const isReplay = request.headers.cookie === 'lef_login_state=test-state'
            if (
                (isMismatch && !pendingStateAvailable) ||
                (isReplay && pendingStateAvailable) ||
                (!isMismatch && !isReplay)
            ) {
                response.writeHead(500).end()
                return
            }
            response.writeHead(302, {
                location: `${baseUrl}/auth/error?code=login_state_invalid`,
                'set-cookie':
                    'lef_login_state=; Path=/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end()
            return
        }
        if (request.url === '/v1/auth/session' && request.headers.authorization) {
            response.writeHead(403, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ code: 'human_session_required' }))
            return
        }
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ code: 'authentication_required' }))
    })
    await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const testMetadata = { ...metadata, apiUrl: baseUrl, keycloakUrl: baseUrl }
    const testIssuer = `${baseUrl}/realms/lead-email-finder`
    const testServiceClient = serviceClient
    const testServiceCredential = { ...serviceCredential, issuers: [testIssuer] }
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lef-bruno-test-'))
    const previousTemp = process.env.TMPDIR
    process.env.TMPDIR = temporaryRoot
    try {
        const environment = collectionEnvironment(
            'bff-sessions',
            testMetadata,
            testServiceClient,
            testServiceCredential,
        )
        assert.deepEqual(await executeCollection('bff-sessions', environment, checkoutRoot), {
            requests: 15,
            tests: 16,
        })
        assert.deepEqual(await readdir(temporaryRoot), [])
        wrongIssuer = true
        await assert.rejects(executeCollection('bff-sessions', environment, checkoutRoot), /raw output is withheld/)
        assert.deepEqual(await readdir(temporaryRoot), [])
    } finally {
        if (previousTemp === undefined) delete process.env.TMPDIR
        else process.env.TMPDIR = previousTemp
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
        await rm(temporaryRoot, { recursive: true, force: true })
    }
})
