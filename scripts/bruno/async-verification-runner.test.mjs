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
        customerClientSecret({}, customer.keycloakClientId, async () => ({ ok: false })),
        /fixture request failed/,
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

test('pinned CLI runs the async workflow once and rejects raw queue states', async () => {
    let origin
    let balance = 0
    let enqueues = 0
    let reads = 0
    let rawQueueState = false
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
            if (balance === 0) return reply(402, {})
            if (JSON.parse(raw).email !== 'person@lef.test') return reply(400, {})
            balance--
            enqueues++
            return reply(202, { id: job })
        }
        const id = pathname.split('/').at(-1)
        if (id === 'not-a-uuid') return reply(400, {})
        if (id !== job || client !== customer.keycloakClientId) return reply(404, {})
        reads++
        if (rawQueueState) return reply(200, { state: 'waiting', failedReason: 'private exception' })
        return reply(200, reads < 2 ? { state: 'queued' } : { state: 'completed', result })
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
        assert.deepEqual(await executeCollection('async-verification', environment, root), { requests: 15, tests: 15 })
        assert.equal(enqueues, 1)
        assert.equal(balance, 0)
        assert.ok(reads >= 4)
        rawQueueState = true
        await assert.rejects(executeCollection('async-verification', environment, root), /raw output is withheld/)
    } finally {
        server.closeAllConnections()
        await new Promise(done => server.close(done))
    }
})
