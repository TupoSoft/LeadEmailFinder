import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { cliArguments, executeCollection, registeredCollection } from './run-collection.mjs'
import { customerClientSecret, validateCustomerFixture, withRestoredBalance } from './async-verification-fixture.mjs'
import { brunoFailure, failureDiagnostic } from './failure-diagnostic.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const organizationId = randomUUID()
const issuer = 'http://localhost:58106/realms/lead-email-finder'
const customer = { issuer, issuers: [issuer], organizationId, keycloakClientId: 'lef-svc-dev-fixture' }

test('async fixture requires the distinct seeded customer and matching public identity', () => {
    assert.deepEqual(validateCustomerFixture(customer, issuer, randomUUID()), customer)
    for (const [value, platform] of [
        [{ ...customer, keycloakClientId: 'arbitrary-client' }, randomUUID()],
        [{ ...customer, issuer: 'http://keycloak:8080/realms/lead-email-finder' }, randomUUID()],
        [{ ...customer, issuers: [] }, randomUUID()],
        [customer, organizationId],
    ])
        assert.throws(() => validateCustomerFixture(value, issuer, platform))
})

test('customer bootstrap only reads the exact seeded client secret', async () => {
    const calls = []
    const replies = [
        { access_token: 'synthetic-admin-token' },
        [{ clientId: customer.keycloakClientId, id: 'client-id' }],
        { value: 'synthetic-customer-secret' },
    ]
    const result = await customerClientSecret(
        {
            keycloakUrl: 'http://localhost:58106',
            keycloakAdminUsername: 'admin',
            keycloakAdminPassword: 'synthetic-password',
        },
        customer.keycloakClientId,
        async (url, options) => {
            calls.push({ url, method: options.method ?? 'GET' })
            return { ok: true, json: async () => replies.shift() }
        },
    )
    assert.equal(result, 'synthetic-customer-secret')
    assert.deepEqual(
        calls.map(call => call.method),
        ['POST', 'GET', 'GET'],
    )
    assert.match(calls[1].url, /clients\?clientId=lef-svc-dev-fixture$/)
    assert.match(calls[2].url, /clients\/client-id\/client-secret$/)
    await assert.rejects(
        customerClientSecret({}, customer.keycloakClientId, async () => ({ ok: false, status: 403 })),
        error => {
            assert.deepEqual(failureDiagnostic(error), { stage: 'fixture_bootstrap', status: 403 })
            return true
        },
    )
})

test('credit fixture restores and verifies the original balance after success or failure', async () => {
    for (const failure of [false, true]) {
        let balance = 27
        const writes = []
        const request = async (method, amount) => {
            if (method === 'PUT') {
                balance = amount
                writes.push(amount)
            }
            return { balance }
        }
        const running = withRestoredBalance(request, async setBalance => {
            await setBalance(1)
            balance--
            await setBalance(0)
            if (failure) throw new Error('synthetic collection failure')
            return 'passed'
        })
        if (failure) await assert.rejects(running, /synthetic collection failure/)
        else assert.equal(await running, 'passed')
        assert.equal(balance, 27)
        assert.deepEqual(writes, [1, 0, 27])
    }
})

test('async collection registry requires every ordered request, developer sandbox, and both credentials', async () => {
    const folder = resolve(root, 'bruno/async-verification')
    const files = (await readdir(folder)).filter(file => /^\d{2}-.+\.yml$/.test(file)).sort()
    const registered = registeredCollection('async-verification')
    assert.equal(registered.requests, files.length)
    assert.equal(registered.tests, files.length)
    assert.equal(registered.network, 'compose')
    const sequences = await Promise.all(
        files.map(async file => parseYaml(await readFile(resolve(folder, file), 'utf8')).info.seq),
    )
    assert.deepEqual(
        sequences,
        Array.from({ length: files.length }, (_, index) => index + 1),
    )
    const environment = {
        BRUNO_API_URL: 'http://api:3000',
        OIDC_ISSUER_URL: issuer,
        OIDC_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder',
        KEYCLOAK_SERVICE_CLIENT_ID: 'platform',
        KEYCLOAK_SERVICE_CLIENT_SECRET: 'synthetic-platform-secret',
        PLATFORM_ORGANIZATION_ID: randomUUID(),
        CUSTOMER_ORGANIZATION_ID: organizationId,
        CUSTOMER_SERVICE_CLIENT_ID: customer.keycloakClientId,
        CUSTOMER_SERVICE_CLIENT_SECRET: 'synthetic-customer-secret',
    }
    const args = cliArguments('async-verification', environment, '/tmp/report.json')
    assert.deepEqual(args.slice(0, 5), ['run', '--env', 'local', '--sandbox', 'developer'])
    assert.ok(!JSON.stringify(args).includes('synthetic-'))
    for (const field of ['CUSTOMER_ORGANIZATION_ID', 'CUSTOMER_SERVICE_CLIENT_ID', 'CUSTOMER_SERVICE_CLIENT_SECRET']) {
        assert.throws(
            () => cliArguments('async-verification', { ...environment, [field]: '' }, '/tmp/report.json'),
            /prerequisites/,
        )
    }
})

test('balance restoration failures retain only approved operation and prior diagnostics', async () => {
    for (const failure of ['write', 'confirmation']) {
        let reads = 0
        await assert.rejects(
            withRestoredBalance(
                async method => {
                    if (method === 'PUT' && failure === 'write') throw new Error('synthetic-private-provider-body')
                    if (method === 'GET') reads++
                    return { balance: failure === 'confirmation' && reads > 1 ? 0 : 27 }
                },
                async () => {
                    throw new Error('synthetic-private-collection-output')
                },
            ),
            error => {
                assert.deepEqual(failureDiagnostic(error), {
                    stage: 'balance_restore',
                    operation: failure,
                    prior: { stage: 'collection' },
                })
                assert.doesNotMatch(JSON.stringify(error), /synthetic-private/)
                assert.doesNotMatch(error.message, /synthetic-private/)
                return true
            },
        )
    }
})

test('restoration preserves bounded HTTP status and the original collection diagnostic on dual failure', async () => {
    const prior = { stage: 'collection', request: 8, status: 200, requests: 15, tests: 15 }
    for (const operation of ['write', 'confirmation']) {
        let reads = 0
        await assert.rejects(
            withRestoredBalance(
                async method => {
                    if (method === 'GET') reads++
                    if ((operation === 'write' && method === 'PUT') || (operation === 'confirmation' && reads > 1)) {
                        throw brunoFailure({ stage: 'fixture_bootstrap', status: 503 })
                    }
                    return { balance: 27 }
                },
                async () => {
                    throw brunoFailure(prior)
                },
            ),
            error => {
                assert.deepEqual(failureDiagnostic(error), { stage: 'balance_restore', operation, status: 503, prior })
                return true
            },
        )
    }
})

test('a successful collection followed by failed restore has no prior failure', async () => {
    await assert.rejects(
        withRestoredBalance(
            async method => {
                if (method === 'PUT') throw brunoFailure({ stage: 'fixture_bootstrap', status: 403 })
                return { balance: 27 }
            },
            async () => 'passed',
        ),
        error => {
            assert.deepEqual(failureDiagnostic(error), { stage: 'balance_restore', operation: 'write', status: 403 })
            return true
        },
    )
})

test('successful restoration preserves the exact callback error and its stack', async () => {
    const original = new Error('synthetic-private-callback-output')
    await assert.rejects(
        withRestoredBalance(
            async () => ({ balance: 27 }),
            async () => {
                throw original
            },
        ),
        error => {
            assert.equal(error, original)
            assert.equal(error.stack, original.stack)
            return true
        },
    )
})

test('pinned CLI verifies async settlement, cooldown and idempotency and rejects raw queue states', async () => {
    let origin
    let balance = 0
    let enqueues = 0
    let reads = 0
    let completed = false
    let rawQueueState = false
    const keyedSubmissions = new Map()
    const job = randomUUID()
    const result = {
        id: randomUUID(),
        email: 'person@lef.test',
        localPart: 'person',
        domain: 'lef.test',
        exists: null,
        catchAll: true,
        reason: 'accepted_email',
        sources: [],
    }
    const operation = {
        id: job,
        source: 'fresh',
        observedAt: null,
        cacheExpiresAt: null,
        billing: { state: 'settled', reserved: 1, charged: 0, reason: 'inconclusive' },
    }
    const server = createServer(async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { 'content-type': 'application/json' })
            response.end(JSON.stringify(body))
        }
        const pathname = new URL(request.url, origin).pathname
        let raw = ''
        for await (const chunk of request) raw += chunk
        if (pathname.endsWith('/protocol/openid-connect/token')) {
            const client = new URLSearchParams(raw).get('client_id')
            const claims = Buffer.from(JSON.stringify({ iss: origin, client })).toString('base64url')
            return reply(200, { access_token: `synthetic.${claims}.signature` })
        }
        const authorization = request.headers.authorization
        if (!authorization) return reply(401, {})
        const client = JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString()).client
        if (pathname.startsWith('/credits/')) {
            if (client !== 'platform') return reply(403, {})
            if (request.method === 'PUT') balance = JSON.parse(raw).amount
            return reply(200, { balance })
        }
        if (pathname === '/verifyAsync') {
            const email = JSON.parse(raw).email
            if (email === 'invalid-address') return reply(400, {})
            const key = request.headers['idempotency-key']
            if (key) {
                const previous = keyedSubmissions.get(key)
                if (previous) {
                    return previous.email === email
                        ? reply(202, { id: previous.id })
                        : reply(409, { message: 'idempotency_key_conflict' })
                }
                const timestamp = Number.parseInt(key.replaceAll('-', '').slice(0, 12), 16)
                if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
                    return reply(410, { message: 'idempotency_key_expired' })
                }
            }
            if (email === result.email && completed) {
                response.setHeader('Retry-After', '60')
                return reply(429, { message: 'verification_cooldown' })
            }
            if (balance === 0) return reply(402, { message: 'insufficient_credits' })
            balance--
            enqueues++
            if (key) {
                const id = randomUUID()
                keyedSubmissions.set(key, { id, email })
                return reply(202, { id })
            }
            return reply(202, { id: job })
        }
        const id = pathname.split('/').at(-1)
        if (id === 'not-a-uuid') return reply(400, {})
        if (id !== job || client !== customer.keycloakClientId) return reply(404, {})
        reads++
        if (rawQueueState) return reply(200, { state: 'waiting', failedReason: 'private exception' })
        if (reads < 2) return reply(200, { state: 'queued' })
        if (!completed) {
            completed = true
            balance++
        }
        return reply(200, { state: 'completed', result, operation })
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${server.address().port}`
    const environment = {
        BRUNO_API_URL: origin,
        OIDC_ISSUER_URL: origin,
        OIDC_BACKCHANNEL_URL: origin,
        KEYCLOAK_SERVICE_CLIENT_ID: 'platform',
        KEYCLOAK_SERVICE_CLIENT_SECRET: 'synthetic-platform-secret',
        PLATFORM_ORGANIZATION_ID: randomUUID(),
        CUSTOMER_ORGANIZATION_ID: organizationId,
        CUSTOMER_SERVICE_CLIENT_ID: customer.keycloakClientId,
        CUSTOMER_SERVICE_CLIENT_SECRET: 'synthetic-customer-secret',
    }
    try {
        assert.deepEqual(await executeCollection('async-verification', environment, root), { requests: 22, tests: 22 })
        assert.equal(enqueues, 2)
        assert.equal(keyedSubmissions.size, 1)
        assert.equal(balance, 1)
        assert.ok(reads >= 4)
        completed = false
        reads = 0
        keyedSubmissions.clear()
        rawQueueState = true
        await assert.rejects(executeCollection('async-verification', environment, root), error => {
            const diagnostic = failureDiagnostic(error)
            assert.equal(diagnostic.stage, 'collection')
            assert.equal(diagnostic.request, 8)
            assert.equal(diagnostic.requests, 22)
            assert.match(error.message, /raw output is withheld/)
            assert.doesNotMatch(JSON.stringify(error), /private exception|synthetic-customer-secret|person@lef.test/)
            return true
        })
    } finally {
        server.closeAllConnections()
        await new Promise(done => server.close(done))
    }
})
