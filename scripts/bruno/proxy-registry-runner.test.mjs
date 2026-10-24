import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { parse } from 'yaml'
import { cliArguments, collectionEnvironment, executeCollection, registeredCollection } from './run-collection.mjs'

const root = resolve(import.meta.dirname, '../..')
const execute = promisify(execFile)

test('proxy registry requires every request and uses the pinned private host launcher', async () => {
    const directory = resolve(root, 'bruno/proxy-registry')
    const files = (await readdir(directory)).filter(file => /^\d.+\.yml$/.test(file)).sort()
    const requests = await Promise.all(files.map(async file => parse(await readFile(resolve(directory, file), 'utf8'))))
    const registered = registeredCollection('proxy-registry')
    assert.deepEqual(registered, { requests: 27, tests: 27, sandbox: 'developer', network: 'host', countOnly: true })
    assert.deepEqual(
        requests.map(request => request.info.seq),
        Array.from({ length: 27 }, (_, index) => index + 1),
    )
    const script = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).scripts['bruno:proxy-registry']
    assert.equal(script, 'node scripts/bruno/run-collection.mjs proxy-registry')
    const creation = requests.find(request => request.info.name.endsWith('-create-proxy'))
    assert.equal(Object.hasOwn(JSON.parse(creation.http.body.data), 'state'), false)
    const ordinaryUpdate = requests.find(request => request.info.name.endsWith('-update-without-auth'))
    assert.equal(Object.hasOwn(JSON.parse(ordinaryUpdate.http.body.data), 'auth'), false)
    const metadata = {
        checkoutRoot: root,
        composeProject: 'lef-test',
        apiUrl: 'http://localhost:53000',
        keycloakUrl: 'http://localhost:58080',
    }
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const secret = 'lef_' + randomBytes(32).toString('base64url')
    const environment = collectionEnvironment(
        'proxy-registry',
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
            organizationId: randomUUID(),
        },
        { organizationId: randomUUID(), keycloakClientId: 'local-service', issuers: [issuer] },
    )
    assert.equal(environment.BRUNO_API_URL, metadata.apiUrl)
    assert.equal(environment.OIDC_ISSUER_URL, issuer)
    const args = cliArguments('proxy-registry', environment, '/tmp/report.json')
    assert.equal(args[4], 'developer')
    assert.equal(JSON.stringify(args).includes(secret), false)
    assert.ok(args.includes('--reporter-skip-body'))
    assert.ok(args.includes('--reporter-skip-all-headers'))
})

test('proxy credential markers never reach CLI logs or reporter files on failure', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-proxy-reporter-'))
    const reportFile = resolve(directory, 'report.json')
    const markers = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]
    try {
        await assert.rejects(
            execute(
                process.execPath,
                [
                    '--import',
                    resolve(root, 'scripts/bruno/count-only-reporter.mjs'),
                    '--input-type=module',
                    '-e',
                    `
                import fs from 'node:fs';
                const [user, pass] = JSON.parse(process.env.TEST_PROXY_MARKERS);
                console.log(user); console.error(pass);
                fs.writeFileSync(process.env.LEF_BRUNO_COUNTS_REPORT, JSON.stringify([{
                    summary: {totalRequests: 1, totalTests: 1},
                    results: [{request: {data: {auth: {user, pass}}}, response: {data: {auth: {user, pass}}},
                        error: pass, testResults: [{status: 'fail', message: user}]}]
                }]));
                throw new Error(pass);
            `,
                ],
                {
                    env: {
                        ...process.env,
                        LEF_BRUNO_COUNTS_REPORT: reportFile,
                        TEST_PROXY_MARKERS: JSON.stringify(markers),
                    },
                },
            ),
            error => {
                assert.equal(error.stdout, '')
                assert.equal(error.stderr, '')
                for (const marker of markers) assert.equal(error.message.includes(marker), false)
                return true
            },
        )
        assert.deepEqual(await readdir(directory), ['report.json'])
        const report = await readFile(reportFile, 'utf8')
        for (const marker of markers) assert.equal(report.includes(marker), false)
        assert.deepEqual(JSON.parse(report)[0].results, [
            { skipped: false, error: true, testResults: [{ status: 'fail' }] },
        ])
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('pinned proxy CLI covers cursors, lifecycle, credential omission, blacklist deduplication and exact cleanup', async () => {
    const secret = randomBytes(32).toString('base64url')
    const token = randomBytes(32).toString('base64url')
    const originalId = '00000000-0000-4000-8000-000000000001'
    const original = { id: originalId, state: 'disabled', blacklists: [], description: 'Unrelated fixture' }
    const proxies = new Map([[originalId, original]])
    const markers = [secret, token]
    const seen = []
    let omittedAuthUpdates = 0
    let failMode
    let baseUrl
    const server = createServer(async (request, response) => {
        const url = new URL(request.url, baseUrl)
        const pathname = url.pathname
        let raw = ''
        for await (const chunk of request) raw += chunk
        const reply = (status, body) => {
            response.writeHead(status, {
                'content-type': 'application/json',
                'cache-control': failMode === 'cache' ? 'public' : 'no-store',
            })
            response.end(body === undefined ? undefined : JSON.stringify(body))
        }
        if (pathname.endsWith('/protocol/openid-connect/token')) {
            assert.equal(new URLSearchParams(raw).get('client_secret'), secret)
            return reply(200, { access_token: token })
        }
        seen.push([request.method, pathname, url.search])
        if (!request.headers.authorization) return reply(401, {})
        const visible = proxy => {
            const { auth, ...value } = proxy
            return failMode === 'redaction' && auth ? { ...value, auth } : value
        }
        if (pathname === '/v1/proxies' && request.method === 'GET') {
            const cursor = url.searchParams.get('pageToken')
            if (cursor && !/^[a-f0-9-]{36}$/.test(cursor)) return reply(400, {})
            const size = Number(url.searchParams.get('pageSize') ?? 100)
            const rows = [...proxies.values()]
                .filter(proxy => !cursor || proxy.id > cursor)
                .sort((left, right) => left.id.localeCompare(right.id))
            return reply(200, {
                proxies: rows.slice(0, size).map(visible),
                nextPageToken: rows.length > size ? rows[size - 1].id : '',
            })
        }
        if (pathname === '/v1/proxies/healthy') {
            return reply(200, visible([...proxies.values()].find(proxy => proxy.state === 'active')))
        }
        if (pathname === '/v1/proxies' && request.method === 'POST') {
            const body = JSON.parse(raw)
            if (
                Object.hasOwn(body, 'auth') &&
                (!body.auth || Array.isArray(body.auth) || !body.auth.user || !body.auth.pass)
            )
                return reply(400, {})
            const proxy = { ...body, id: randomUUID(), state: body.state ?? 'disabled', blacklists: [] }
            if (body.auth) markers.push(body.auth.user, body.auth.pass)
            proxies.set(proxy.id, proxy)
            return reply(201, visible(proxy))
        }
        const match = /^\/v1\/proxies\/([^/]+)(\/blacklists)?$/.exec(pathname)
        const proxy = match ? proxies.get(match[1]) : undefined
        if (!proxy) return reply(404, {})
        assert.notEqual(proxy.id, originalId, 'The collection must leave unrelated proxies untouched')
        if (request.method === 'PATCH') {
            const body = JSON.parse(raw)
            if (
                Object.hasOwn(body, 'auth') &&
                (!body.auth || Array.isArray(body.auth) || !body.auth.user || !body.auth.pass)
            )
                return reply(400, {})
            const previousAuth = proxy.auth
            Object.assign(proxy, body)
            if (body.maxConcurrent === 2) {
                assert.equal(Object.hasOwn(body, 'auth'), false)
                assert.equal(proxy.auth, previousAuth)
                assert.ok(proxy.auth.user && proxy.auth.pass)
                omittedAuthUpdates++
            }
            if (body.auth) markers.push(body.auth.user, body.auth.pass)
            return reply(200, visible(proxy))
        }
        if (request.method === 'POST' && match[2]) {
            proxy.blacklists = [...new Set([...proxy.blacklists, JSON.parse(raw).mxHost])]
            return reply(204)
        }
        if (request.method === 'DELETE') proxies.delete(proxy.id)
        return reply(200, visible(proxy))
    })
    await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const environment = {
        BRUNO_API_URL: baseUrl,
        OIDC_ISSUER_URL: baseUrl,
        PLATFORM_API_KEY: secret,
    }
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-proxy-cli-'))
    const previous = process.env.TMPDIR
    process.env.TMPDIR = directory
    try {
        assert.deepEqual(await executeCollection('proxy-registry', environment, root), { requests: 27, tests: 27 })
        assert.equal(omittedAuthUpdates, 1)
        assert.equal(proxies.size, 1)
        assert.equal(proxies.get(originalId), original)
        assert.equal(seen.length, 27)
        assert.equal(seen[8][2], `?pageSize=100&pageToken=${originalId}`)
        assert.deepEqual(await readdir(directory), [])
        for (const failure of ['cache', 'redaction']) {
            failMode = failure
            await assert.rejects(executeCollection('proxy-registry', environment, root), error => {
                for (const marker of markers) assert.equal(error.message.includes(marker), false)
                return /raw output is withheld/.test(error.message)
            })
            assert.equal(proxies.size, 1, 'The CLI must finish exact-ID cleanup even after assertion failures')
            assert.equal(proxies.get(originalId), original)
            assert.deepEqual(await readdir(directory), [])
        }
    } finally {
        if (previous === undefined) delete process.env.TMPDIR
        else process.env.TMPDIR = previous
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
        await rm(directory, { recursive: true, force: true })
    }
})
