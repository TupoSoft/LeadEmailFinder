import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'
import { cliArguments, collectionEnvironment, executeCollection, registeredCollection } from './run-collection.mjs'

const root = resolve(import.meta.dirname, '../..')

test('service-client launcher owns management rejections and key validation requests, private reports, and internally loaded organization metadata', async () => {
    const directory = resolve(root, 'bruno/service-client-management')
    const files = (await readdir(directory)).filter(file => /^\d.+\.yml$/.test(file)).sort()
    const requests = await Promise.all(files.map(async file => parse(await readFile(resolve(directory, file), 'utf8'))))
    const registered = registeredCollection('service-client-management')
    assert.equal(registered.requests, 10)
    assert.equal(registered.tests, 10)
    assert.equal(registered.countOnly, true)
    assert.deepEqual(
        requests.map(request => request.info.seq),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    )
    assert.equal(
        requests.slice(0, 6).every(request => !/to\.equal\(20\d\)/.test(request.runtime.scripts[0].code)),
        true,
    )
    const metadata = {
        checkoutRoot: root,
        composeProject: 'lef-test',
        apiUrl: 'http://localhost:53000',
        keycloakUrl: 'http://localhost:58080',
    }
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const secret = 'lef_' + randomBytes(32).toString('base64url')
    const organizationId = randomUUID()
    const environment = collectionEnvironment(
        'service-client-management',
        metadata,
        {
            version: 1,
            kind: 'platform',
            checkoutRoot: root,
            composeProject: 'lef-test',
            issuer: 'urn:lead-email-finder:auth',
            apiKey: secret,
            keyPrefix: secret.slice(0, 12),
            credentialId: randomUUID(),
            organizationId: organizationId,
        },
        { organizationId, keycloakClientId: 'local-service', issuers: [issuer] },
    )
    assert.equal(environment.SERVICE_CLIENT_ORGANIZATION_ID, organizationId)
    const args = cliArguments('service-client-management', environment, '/tmp/report.json')
    assert.equal(args[4], 'developer')
    assert.equal(JSON.stringify(args).includes(secret), false)
    assert.throws(() =>
        cliArguments(
            'service-client-management',
            { ...environment, SERVICE_CLIENT_ORGANIZATION_ID: '' },
            '/tmp/report.json',
        ),
    )
})

test('pinned CLI executes each rejection and fails closed without retaining secret-bearing responses', async () => {
    const organizationId = randomUUID()
    const secret = randomBytes(32).toString('base64url')
    const token = randomBytes(32).toString('base64url')
    const seen = []
    let failRejection = false
    let baseUrl
    const server = createServer(async (request, response) => {
        const pathname = new URL(request.url, baseUrl).pathname
        let raw = ''
        for await (const chunk of request) raw += chunk
        response.setHeader('content-type', 'application/json')
        response.setHeader('cache-control', 'no-store')
        if (pathname.endsWith('/protocol/openid-connect/token')) {
            assert.equal(new URLSearchParams(raw).get('client_secret'), secret)
            response.end(JSON.stringify({ access_token: token }))
            return
        }
        if (pathname === '/v1/auth/api-key') {
            response.statusCode = request.headers.authorization === `Bearer ${secret}` ? 204 : 401
            response.end()
            return
        }
        seen.push([request.method, pathname, Boolean(request.headers.authorization)])
        if (!pathname.startsWith(`/v1/organizations/${organizationId}/service-clients`)) response.statusCode = 404
        else response.statusCode = request.headers.authorization ? 403 : 401
        if (failRejection) {
            response.statusCode = 201
            response.end(JSON.stringify({ apiKey: secret }))
        } else response.end('{}')
    })
    await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const environment = {
        BRUNO_API_URL: baseUrl,
        OIDC_ISSUER_URL: baseUrl,
        PLATFORM_API_KEY: secret,
        SERVICE_CLIENT_ORGANIZATION_ID: organizationId,
    }
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-service-client-cli-'))
    const previous = process.env.TMPDIR
    process.env.TMPDIR = directory
    try {
        assert.deepEqual(await executeCollection('service-client-management', environment, root), {
            requests: 10,
            tests: 10,
        })
        assert.deepEqual(
            seen.map(value => [value[0], value[2]]),
            [
                ['POST', false],
                ['POST', true],
                ['GET', true],
                ['POST', true],
                ['POST', true],
                ['DELETE', true],
            ],
        )
        assert.deepEqual(await readdir(directory), [])
        failRejection = true
        await assert.rejects(executeCollection('service-client-management', environment, root), error => {
            assert.equal(error.message.includes(secret) || error.message.includes(token), false)
            return /raw output is withheld/.test(error.message)
        })
        assert.deepEqual(await readdir(directory), [])
    } finally {
        if (previous === undefined) delete process.env.TMPDIR
        else process.env.TMPDIR = previous
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
        await rm(directory, { recursive: true, force: true })
    }
})
