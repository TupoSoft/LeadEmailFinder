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
        EVIDENCE_CONTROL_URL: origin,
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
    assert.equal(registered.requests, 20)
    assert.equal(registered.tests, testCount)
    assert.equal(registered.tests, 30)
    assert.equal(registered.network, 'compose')
    assert.deepEqual(
        documents.map(document => document.info.seq),
        Array.from({ length: 20 }, (_, index) => index + 1),
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
        'EVIDENCE_CONTROL_URL',
    ]) {
        assert.throws(
            () => cliArguments('batch-verification', { ...environment, [field]: '' }, '/tmp/report.json'),
            /prerequisites/,
        )
    }
})

test('pinned CLI verifies duplicate accounting, group denial, fresh fixtures, safe status and ownership boundaries', async () => {
    let origin
    let rawQueueState = false
    let successfulUploads = 0
    let invalidUploads = 0
    let statusReads = 0
    let downloads = 0
    let unauthorized = 0
    let foreignReads = 0
    let rejectedMedia = 0
    let duplicateUploads = 0
    let incorrectPayerReceipt = false
    let incorrectAvailabilityStatus
    let incorrectInvalidAvailability = false
    let balance = 2
    let scenario = 'default'
    let resets = 0
    let duplicateEmails = []
    let groupUploads = 0
    let partialGroupHold = false
    let hiddenGroupCharge = false
    let held = 0
    const groupAddresses = new Set()
    const groupJob = randomUUID()
    const uploadedAddresses = new Set()
    const job = randomUUID()
    const invalidJob = randomUUID()
    const duplicateJob = randomUUID()
    const duplicateResult = randomUUID()
    const server = createServer(async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { 'content-type': 'application/json', 'x-request-id': randomUUID() })
            response.end(JSON.stringify(body))
        }
        const pathname = new URL(request.url, origin).pathname
        let raw = ''
        for await (const chunk of request) raw += chunk
        if (pathname === '/reset' && request.method === 'POST') {
            resets++
            scenario = 'default'
            response.writeHead(204).end()
            return
        }
        if (pathname === '/scenario' && request.method === 'PUT') {
            scenario = JSON.parse(raw).scenario
            assert.equal(scenario, 'target_accepted')
            response.writeHead(204).end()
            return
        }
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
        if (pathname.startsWith('/credits/')) {
            assert.equal(client, 'platform')
            if (request.method === 'PUT') {
                const amount = JSON.parse(raw).amount
                assert.ok([0, 1].includes(amount))
                // The API refuses a balance below credits still held for accepted operations.
                if (amount < held) return reply(409, {})
                balance = amount
            }
            return reply(200, { balance })
        }
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
            if (raw.includes('filename="duplicates.csv"')) {
                assert.equal(scenario, 'target_accepted')
                assert.equal(balance, 1)
                const emails = raw.match(
                    /\bBatch-[0-9a-f-]+@evidence\.lef\.test\n(batch-[0-9a-f-]+@evidence\.lef\.test)\nBATCH-[0-9A-F-]+@EVIDENCE\.LEF\.TEST\n/,
                )
                assert.ok(emails, 'The CSV contains three case-varied fixture rows in order')
                assert.equal(uploadedAddresses.has(emails[1]), false, 'Every collection run uses a fresh address')
                uploadedAddresses.add(emails[1])
                duplicateEmails = emails[0].trim().split('\n')
                duplicateUploads++
                balance--
                return reply(202, { id: duplicateJob })
            }
            if (raw.includes('filename="insufficient-group.csv"')) {
                assert.equal(balance, 1)
                const emails = raw.match(
                    /\n(batch-group-[0-9a-f-]+@evidence\.lef\.test)\n(batch-group-[0-9a-f-]+@evidence\.lef\.test)\n/,
                )
                assert.ok(emails, 'The CSV contains two distinct fresh group addresses')
                assert.notEqual(emails[1], emails[2])
                for (const email of emails.slice(1)) {
                    assert.equal(groupAddresses.has(email), false, 'Every collection run uses fresh group addresses')
                    groupAddresses.add(email)
                }
                groupUploads++
                if (partialGroupHold) held = 1
                if (hiddenGroupCharge) balance--
                return reply(202, { id: groupJob })
            }
            assert.match(raw, /filename="sample.csv"/)
            successfulUploads++
            return reply(202, { id: job })
        }
        if (client !== customerClient) {
            foreignReads++
            return reply(404, {})
        }
        if (pathname === `/verifyBatch/${duplicateJob}`) {
            return reply(200, {
                id: duplicateJob,
                status: 'completed',
                progress: 100,
                total: 1,
                processed: 1,
                unprocessed: 0,
                resultsAvailable: true,
                counts: {
                    totalRows: 3,
                    uniqueAddresses: 1,
                    duplicateRows: 2,
                    cachedAddresses: 0,
                    sharedAddresses: 0,
                    cooldownAddresses: 0,
                    completedAddresses: 1,
                    conclusiveAddresses: 1,
                    inconclusiveAddresses: 0,
                    failedAddresses: 0,
                },
                billing: { state: 'settled', reserved: 1, charged: incorrectPayerReceipt ? 0 : 1 },
            })
        }
        if (pathname === `/verifyBatch/${groupJob}`) {
            return reply(200, {
                id: groupJob,
                status: 'completed',
                progress: 100,
                total: 2,
                processed: 2,
                unprocessed: 0,
                resultsAvailable: true,
                counts: {
                    totalRows: 2,
                    uniqueAddresses: 2,
                    duplicateRows: 0,
                    cachedAddresses: 0,
                    sharedAddresses: 0,
                    cooldownAddresses: 0,
                    completedAddresses: 2,
                    conclusiveAddresses: 0,
                    inconclusiveAddresses: 0,
                    failedAddresses: 2,
                },
                billing: { state: 'settled', reserved: held, charged: 0 },
            })
        }
        if (pathname === `/verifyBatch/${duplicateJob}/results`) {
            response.writeHead(200, {
                'content-type': 'text/csv; charset=utf-8',
                'content-disposition': `attachment; filename="batch-verification-${duplicateJob}.csv"`,
            })
            return response.end(
                [
                    'id,email,normalizedEmail,sourceRow,duplicateOfRow,verificationStatus,verificationQuality,reason,creditsCharged,billingReason',
                    ...duplicateEmails.map((email, index) =>
                        [
                            duplicateResult,
                            email,
                            email.toLowerCase(),
                            index + 1,
                            index === 0 ? '' : 1,
                            'completed',
                            'conclusive_positive',
                            'accepted_email',
                            index === 0 && !incorrectPayerReceipt ? 1 : 0,
                            index === 0 ? (incorrectPayerReceipt ? 'shared' : 'conclusive') : 'duplicate',
                        ].join(','),
                    ),
                    '',
                ].join('\n'),
            )
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
                resultsAvailable: incorrectInvalidAvailability,
                counts: {
                    totalRows: 0,
                    uniqueAddresses: 0,
                    duplicateRows: 0,
                    cachedAddresses: 0,
                    sharedAddresses: 0,
                    cooldownAddresses: 0,
                    completedAddresses: 0,
                    conclusiveAddresses: 0,
                    inconclusiveAddresses: 0,
                    failedAddresses: 0,
                },
                billing: { state: 'settled', reserved: 0, charged: 0 },
            })
        }
        if (pathname === `/verifyBatch/${job}`) {
            statusReads++
            if (rawQueueState)
                return reply(200, { status: 'waiting-children', failedReason: 'private queue exception' })
            const completed = statusReads >= 2
            // Corrupt request 02 only so later requests still exercise the successful workflow.
            const incorrectAvailability = statusReads === 1 && incorrectAvailabilityStatus !== undefined
            const status = incorrectAvailability ? incorrectAvailabilityStatus : completed ? 'completed' : 'running'
            return reply(200, {
                id: job,
                status,
                progress: status === 'completed' ? 100 : 50,
                total: 2,
                processed: completed ? 2 : 1,
                unprocessed: completed ? 0 : 1,
                resultsAvailable: incorrectAvailability ? status !== 'completed' : completed,
                ...(status === 'failed' ? { failureCode: 'processing_failed' } : {}),
                counts: {
                    totalRows: 2,
                    uniqueAddresses: 2,
                    duplicateRows: 0,
                    cachedAddresses: 0,
                    sharedAddresses: 0,
                    cooldownAddresses: 0,
                    completedAddresses: completed ? 2 : 1,
                    conclusiveAddresses: completed ? 2 : 1,
                    inconclusiveAddresses: 0,
                    failedAddresses: 0,
                },
                billing: { state: completed ? 'settled' : 'pending', reserved: 2, charged: completed ? 2 : 0 },
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
        assert.deepEqual(await executeCollection('batch-verification', environment, root), { requests: 20, tests: 30 })
        assert.equal(successfulUploads, 1)
        assert.equal(invalidUploads, 1)
        assert.equal(downloads, 1)
        assert.equal(unauthorized, 1)
        assert.equal(foreignReads, 2)
        assert.equal(rejectedMedia, 1)
        assert.ok(statusReads >= 2)
        assert.equal(duplicateUploads, 1)
        assert.equal(groupUploads, 1)
        assert.equal(balance, 0)
        assert.equal(scenario, 'default')
        assert.equal(resets, 2)
        assert.deepEqual(await executeCollection('batch-verification', environment, root), { requests: 20, tests: 30 })
        assert.equal(duplicateUploads, 2)
        assert.equal(uploadedAddresses.size, 2)
        assert.equal(groupAddresses.size, 4)
        assert.equal(resets, 4)
        incorrectPayerReceipt = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            assert.equal(failureDiagnostic(error).request, 13)
            return true
        })
        assert.equal(balance, 0, 'The regression rejects a hidden charge even when the debit succeeds')
        assert.equal(scenario, 'default')
        incorrectPayerReceipt = false
        partialGroupHold = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            assert.equal(failureDiagnostic(error).request, 19, 'A denied group reports no held credit')
            return true
        })
        partialGroupHold = false
        held = 0
        hiddenGroupCharge = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            assert.equal(failureDiagnostic(error).request, 20, 'A denied group never debits the balance')
            return true
        })
        hiddenGroupCharge = false
        balance = 0
        for (const status of ['queued', 'running', 'completed', 'failed', 'unavailable']) {
            statusReads = 0
            incorrectAvailabilityStatus = status
            await assert.rejects(executeCollection('batch-verification', environment, root), error => {
                assert.equal(failureDiagnostic(error).request, 2, `Rejects incorrect availability for ${status}`)
                return true
            })
        }
        incorrectAvailabilityStatus = undefined
        incorrectInvalidAvailability = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            assert.equal(failureDiagnostic(error).request, 5, 'Invalid CSV never offers a result download')
            return true
        })
        incorrectInvalidAvailability = false
        rawQueueState = true
        await assert.rejects(executeCollection('batch-verification', environment, root), error => {
            const diagnostic = failureDiagnostic(error)
            assert.equal(diagnostic.stage, 'collection')
            assert.equal(diagnostic.request, 2)
            assert.equal(diagnostic.requests, 20)
            assert.match(error.message, /raw output is withheld/)
            assert.doesNotMatch(
                JSON.stringify(error),
                /private queue exception|synthetic-customer-secret|person@lef.test/,
            )
            return true
        })
        assert.equal(scenario, 'default')
        assert.ok(resets >= 7)
    } finally {
        server.closeAllConnections()
        await new Promise(done => server.close(done))
    }
})
