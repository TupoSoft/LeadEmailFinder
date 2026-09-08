import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { cliArguments, executeCollection, registeredCollection } from './run-collection.mjs'
import { failureDiagnostic } from './failure-diagnostic.mjs'
import { customerClientSecret } from './async-verification-fixture.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const customerClient = 'lef-svc-dev-fixture'

test('batch customer secret uses the provisioned organization service identity and read-only admin requests', async () => {
    const metadata = { keycloakUrl: 'http://localhost:58106' }
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const orgAdmin = { issuer, clientId: 'lef-org-admin-service', clientSecret: 'synthetic-admin-secret' }
    const claims = Buffer.from(JSON.stringify({ iss: issuer, azp: orgAdmin.clientId })).toString('base64url')
    const calls = []
    const responses = [
        { access_token: `synthetic.${claims}.signature` },
        [{ clientId: customerClient, id: 'seeded-customer' }],
        { value: 'synthetic-customer-secret' },
    ]
    const secret = await customerClientSecret(
        metadata,
        customerClient,
        async (url, options) => {
            calls.push({ url, options })
            return { ok: true, json: async () => responses.shift() }
        },
        { orgAdmin },
    )
    assert.equal(secret, 'synthetic-customer-secret')
    assert.deepEqual(
        calls.map(call => call.options.method ?? 'GET'),
        ['POST', 'GET', 'GET'],
    )
    assert.equal(calls[0].url, `${issuer}/protocol/openid-connect/token`)
    assert.deepEqual(Object.fromEntries(calls[0].options.body), {
        grant_type: 'client_credentials',
        client_id: orgAdmin.clientId,
        client_secret: orgAdmin.clientSecret,
    })
    assert.equal(
        calls[1].url,
        `${metadata.keycloakUrl}/admin/realms/lead-email-finder/clients?clientId=${customerClient}`,
    )
    assert.equal(
        calls[2].url,
        `${metadata.keycloakUrl}/admin/realms/lead-email-finder/clients/seeded-customer/client-secret`,
    )
})

test('organization administrator identity mismatches fail before reading a customer secret', async () => {
    const metadata = { keycloakUrl: 'http://localhost:58106' }
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const valid = { issuer, clientId: 'lef-org-admin-service', clientSecret: 'synthetic-admin-secret' }
    for (const orgAdmin of [
        null,
        { ...valid, issuer: 'http://unexpected.test' },
        { ...valid, clientId: 'platform' },
        { ...valid, clientSecret: '' },
    ]) {
        await assert.rejects(
            customerClientSecret(
                metadata,
                customerClient,
                () => {
                    assert.fail('Unexpected network request')
                },
                { orgAdmin },
            ),
            /matching organization/,
        )
    }
    await assert.rejects(
        customerClientSecret(
            metadata,
            'arbitrary-client',
            () => {
                assert.fail('Unexpected network request')
            },
            { orgAdmin: valid },
        ),
        /matching organization/,
    )
    for (const claims of [
        { iss: 'http://unexpected.test', azp: valid.clientId },
        { iss: issuer, azp: 'platform' },
    ]) {
        let calls = 0
        await assert.rejects(
            customerClientSecret(
                metadata,
                customerClient,
                async () => {
                    calls++
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: `synthetic.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`,
                        }),
                    }
                },
                { orgAdmin: valid },
            ),
            /token identity did not match/,
        )
        assert.equal(calls, 1)
    }
})

function fixtureEnvironment(origin) {
    return {
        BRUNO_API_URL: origin,
        OIDC_ISSUER_URL: origin,
        OIDC_BACKCHANNEL_URL: origin,
        KEYCLOAK_SERVICE_CLIENT_ID: 'platform',
        KEYCLOAK_SERVICE_CLIENT_SECRET: 'synthetic-platform-secret',
        PLATFORM_ORGANIZATION_ID: randomUUID(),
        CUSTOMER_ORGANIZATION_ID: randomUUID(),
        CUSTOMER_SERVICE_CLIENT_ID: customerClient,
        CUSTOMER_SERVICE_CLIENT_SECRET: 'synthetic-customer-secret',
    }
}

test('batch registry pins every ordered request, test count, sandbox and distinct customer credentials', async () => {
    const folder = resolve(root, 'bruno/batch-verification')
    const files = (await readdir(folder)).filter(file => /^\d{2}-.+\.yml$/.test(file)).sort()
    const documents = await Promise.all(
        files.map(async file => parseYaml(await readFile(resolve(folder, file), 'utf8'))),
    )
    const testCount = documents.reduce(
        (count, document) =>
            count +
            (document.runtime.scripts
                .filter(script => script.type === 'tests')
                .map(script => script.code)
                .join('\n')
                .match(/\btest\(/g)?.length ?? 0),
        0,
    )
    const registered = registeredCollection('batch-verification')
    assert.equal(registered.requests, files.length)
    assert.equal(registered.requests, 9)
    assert.equal(registered.tests, testCount)
    assert.equal(registered.tests, 15)
    assert.equal(registered.network, 'compose')
    assert.deepEqual(
        documents.map(document => document.info.seq),
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
    )
    const environment = fixtureEnvironment('http://127.0.0.1:58106')
    const args = cliArguments('batch-verification', environment, '/tmp/report.json')
    assert.deepEqual(args.slice(0, 5), ['run', '--env', 'local', '--sandbox', 'developer'])
    assert.doesNotMatch(JSON.stringify(args), /synthetic-/)
    for (const field of [
        'CUSTOMER_ORGANIZATION_ID',
        'CUSTOMER_SERVICE_CLIENT_ID',
        'CUSTOMER_SERVICE_CLIENT_SECRET',
        'PLATFORM_ORGANIZATION_ID',
        'KEYCLOAK_SERVICE_CLIENT_ID',
        'KEYCLOAK_SERVICE_CLIENT_SECRET',
        'OIDC_BACKCHANNEL_URL',
    ]) {
        assert.throws(
            () => cliArguments('batch-verification', { ...environment, [field]: '' }, '/tmp/report.json'),
            /prerequisites/,
        )
    }
})

test('pinned CLI verifies batch upload, safe progress, CSV bytes, terminal failure and ownership boundaries', async () => {
    let origin
    let rawQueueState = false
    let successfulUploads = 0
    let invalidUploads = 0
    let statusReads = 0
    let downloads = 0
    let unauthorized = 0
    let foreignReads = 0
    let rejectedMedia = 0
    const job = randomUUID()
    const invalidJob = randomUUID()
    const server = createServer(async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { 'content-type': 'application/json', 'x-request-id': randomUUID() })
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
        if (!authorization) {
            unauthorized++
            return reply(401, {})
        }
        const client = JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString()).client
        if (pathname === '/verifyBatch/csv' && request.method === 'POST') {
            if (client !== customerClient) return reply(403, {})
            assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/)
            assert.equal((raw.match(/Content-Disposition: form-data; name="file"/g) ?? []).length, 1)
            if (raw.includes('filename="not-csv.txt"')) {
                rejectedMedia++
                return reply(422, {})
            }
            if (raw.includes('filename="invalid.csv"')) {
                invalidUploads++
                return reply(202, { id: invalidJob })
            }
            assert.match(raw, /filename="sample.csv"/)
            successfulUploads++
            return reply(202, { id: job })
        }
        if (client !== customerClient) {
            foreignReads++
            return reply(404, {})
        }
        if (pathname === `/verifyBatch/${invalidJob}`) {
            return reply(200, {
                id: invalidJob,
                status: 'failed',
                progress: 0,
                total: 0,
                processed: 0,
                unprocessed: 0,
                failureCode: 'invalid_csv',
            })
        }
        if (pathname === `/verifyBatch/${job}`) {
            statusReads++
            if (rawQueueState)
                return reply(200, { status: 'waiting-children', failedReason: 'private queue exception' })
            return reply(200, {
                id: job,
                status: statusReads < 2 ? 'running' : 'completed',
                progress: statusReads < 2 ? 50 : 100,
                total: 2,
                processed: statusReads < 2 ? 1 : 2,
                unprocessed: statusReads < 2 ? 1 : 0,
            })
        }
        if (pathname === `/verifyBatch/${job}/results`) {
            downloads++
            response.writeHead(200, {
                'content-type': 'text/csv; charset=utf-8',
                'content-disposition': `attachment; filename="batch-verification-${job}.csv"`,
                'x-request-id': randomUUID(),
            })
            return response.end(`id,email\n${randomUUID()},person@lef.test\n${randomUUID()},other@lef.test\n`)
        }
        return reply(404, {})
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${server.address().port}`
    const environment = fixtureEnvironment(origin)
    try {
        assert.deepEqual(await executeCollection('batch-verification', environment, root), { requests: 9, tests: 15 })
        assert.equal(successfulUploads, 1)
        assert.equal(invalidUploads, 1)
        assert.equal(downloads, 1)
        assert.equal(unauthorized, 1)
        assert.equal(foreignReads, 2)
        assert.equal(rejectedMedia, 1)
        assert.ok(statusReads >= 2)
        rawQueueState = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            const diagnostic = failureDiagnostic(error)
            assert.equal(diagnostic.stage, 'collection')
            assert.equal(diagnostic.request, 2)
            assert.equal(diagnostic.requests, 9)
            assert.match(error.message, /raw output is withheld/)
            assert.doesNotMatch(
                JSON.stringify(error),
                /private queue exception|synthetic-customer-secret|person@lef.test/,
            )
            return true
        })
    } finally {
        server.closeAllConnections()
        await new Promise(done => server.close(done))
    }
})
