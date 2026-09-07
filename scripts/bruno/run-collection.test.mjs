import assert from 'node:assert/strict'
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
} from './run-collection.mjs'

const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const metadata = { apiUrl: 'http://localhost:53000', keycloakUrl: 'http://localhost:58080' }
const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
const serviceClient = { issuer, clientId: 'local-service', clientSecret: 'synthetic-secret-never-log' }
const serviceCredential = {
    organizationId: '2ea277e5-954a-4c3d-9464-cfbb0b2e1779',
    keycloakClientId: serviceClient.clientId,
    issuers: [issuer],
}

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
    assert.deepEqual(sequence, Array.from({ length: requests.length }, (_, index) => index + 1))
})

test('selects public host endpoints for BFF and internal transport with public identity for SMTP', () => {
    assert.deepEqual(collectionEnvironment('bff-sessions', metadata, serviceClient, serviceCredential), {
        BRUNO_API_URL: metadata.apiUrl,
        OIDC_ISSUER_URL: issuer,
        KEYCLOAK_SERVICE_CLIENT_ID: serviceClient.clientId,
        KEYCLOAK_SERVICE_CLIENT_SECRET: serviceClient.clientSecret,
    })
    const environment = collectionEnvironment('smtp-dev', metadata, serviceClient, serviceCredential)
    assert.equal(environment.BRUNO_API_URL, 'http://api:3000')
    assert.equal(environment.OIDC_BACKCHANNEL_URL, 'http://keycloak:8080/realms/lead-email-finder')
    assert.equal(environment.OIDC_ISSUER_URL, issuer)
    assert.equal(environment.KEYCLOAK_SERVICE_CLIENT_SECRET, serviceClient.clientSecret)
})

test('rejects missing or mismatched fixture metadata without exposing its values', () => {
    for (const [client, credential] of [
        [undefined, serviceCredential],
        [serviceClient, undefined],
        [{ ...serviceClient, issuer: 'http://keycloak:8080/realms/lead-email-finder' }, serviceCredential],
        [serviceClient, { ...serviceCredential, keycloakClientId: 'another-client' }],
        [serviceClient, { ...serviceCredential, organizationId: 'not-a-uuid' }],
        [serviceClient, { ...serviceCredential, issuers: [] }],
    ]) {
        assert.throws(
            () => collectionEnvironment('bff-sessions', metadata, client, credential),
            error => {
                assert.match(error.message, /matching provisioned/)
                assert.ok(!error.message.includes(serviceClient.clientSecret))
                return true
            },
        )
    }
})

test('token-minting collections always use developer sandbox and credentials never enter arguments', () => {
    const environment = collectionEnvironment('smtp-dev', metadata, serviceClient, serviceCredential)
    const args = cliArguments('smtp-dev', environment, '/tmp/report.json')
    assert.deepEqual(args.slice(0, 5), ['run', '--env', 'local', '--sandbox', 'developer'])
    assert.ok(args.includes('--reporter-skip-all-headers'))
    assert.ok(args.includes('--reporter-skip-body'))
    assert.ok(!JSON.stringify(args).includes(serviceClient.clientSecret))
    assert.ok(!composeWorker.includes(serviceClient.clientSecret))
    assert.throws(
        () => cliArguments('smtp-dev', { ...environment, KEYCLOAK_SERVICE_CLIENT_SECRET: '' }, '/tmp/report'),
        /prerequisites/,
    )
    const bffEnvironment = collectionEnvironment('bff-sessions', metadata, serviceClient, serviceCredential)
    assert.equal(cliArguments('bff-sessions', bffEnvironment, '/tmp/report')[4], 'developer')
    assert.ok(
        !JSON.stringify(cliArguments('bff-sessions', bffEnvironment, '/tmp/report')).includes(
            serviceClient.clientSecret,
        ),
    )
    assert.throws(
        () => cliArguments('bff-sessions', { ...bffEnvironment, KEYCLOAK_SERVICE_CLIENT_SECRET: '' }, '/tmp/report'),
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
    const testMetadata = { apiUrl: baseUrl, keycloakUrl: baseUrl }
    const testIssuer = `${baseUrl}/realms/lead-email-finder`
    const testServiceClient = { ...serviceClient, issuer: testIssuer }
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
