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
import { cliArguments, executeCollection, registeredCollection } from './run-collection.mjs'
import { withExpiredInvitation } from './invitation-expiry-fixture.mjs'

const root = resolve(import.meta.dirname, '../..')
const execute = promisify(execFile)

test('organization collection requires every executed request in order and keeps runtime secrets outside arguments', async () => {
    const directory = resolve(root, 'bruno/organization-onboarding')
    const files = (await readdir(directory)).filter(file => /^\d.+\.yml$/.test(file))
    const sequences = await Promise.all(
        files.map(async file => parse(await readFile(resolve(directory, file), 'utf8')).info.seq),
    )
    const registered = registeredCollection('organization-onboarding')
    assert.equal(registered.requests, files.length)
    assert.equal(registered.tests, 23)
    assert.equal(registered.countOnly, true)
    assert.deepEqual(
        sequences.sort((a, b) => a - b),
        Array.from({ length: 23 }, (_, index) => index + 1),
    )
    const environment = {
        BRUNO_API_URL: 'http://localhost:53000',
        OIDC_ISSUER_URL: 'http://localhost:58080',
        PLATFORM_API_KEY: randomUUID(),
        BRUNO_EXPIRED_INVITATION_TOKEN: randomUUID(),
        CUSTOMER_API_KEY: randomUUID(),
    }
    const args = cliArguments('organization-onboarding', environment, '/tmp/report.json')
    assert.equal(args[4], 'developer')
    for (const secret of [
        environment.PLATFORM_API_KEY,
        environment.BRUNO_EXPIRED_INVITATION_TOKEN,
        environment.CUSTOMER_API_KEY,
    ]) {
        assert.equal(
            JSON.stringify(args).includes(secret),
            false,
            'Runtime credentials must stay out of command arguments',
        )
    }
    assert.throws(() =>
        cliArguments(
            'organization-onboarding',
            { ...environment, BRUNO_EXPIRED_INVITATION_TOKEN: '' },
            '/tmp/report.json',
        ),
    )
    assert.throws(() =>
        cliArguments('organization-onboarding', { ...environment, CUSTOMER_API_KEY: '' }, '/tmp/report.json'),
    )
})

test('invitation CLI reporter writes only counts and emits no secrets on its failure path', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-invitation-reporter-'))
    const reportFile = resolve(directory, 'report.json')
    const marker = randomBytes(32).toString('hex')
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
                const marker = process.env.TEST_SECRET_MARKER;
                console.log(marker); console.error(marker);
                fs.writeFileSync(process.env.LEF_BRUNO_COUNTS_REPORT, JSON.stringify([{
                    summary: {totalRequests: 1, totalTests: 1},
                    results: [{request: {url: marker}, response: {data: marker}, error: marker, testResults: [{status: 'fail', message: marker}]}]
                }]));
                throw new Error(marker);
            `,
                ],
                { env: { ...process.env, LEF_BRUNO_COUNTS_REPORT: reportFile, TEST_SECRET_MARKER: marker } },
            ),
            error => {
                assert.ok(error.stdout.length === 0, 'CLI stdout must stay empty')
                assert.ok(error.stderr.length === 0, 'CLI stderr must stay empty')
                assert.equal(error.message.includes(marker), false, 'Failure output must not contain secret markers')
                return true
            },
        )
        const persisted = await readFile(reportFile, 'utf8')
        assert.equal(persisted.includes(marker), false, 'Reporter output must omit secrets before writing')
        const [report] = JSON.parse(persisted)
        assert.deepEqual(Object.keys(report).sort(), ['results', 'skipped', 'summary'])
        assert.deepEqual(report.results, [{ skipped: false, error: true, testResults: [{ status: 'fail' }] }])
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('expired fixture hashes its runtime token and removes only its exact invitation after failure', async () => {
    const queries = []
    let connected = false
    let ended = false
    const organizationId = randomUUID()
    const client = {
        async connect() {
            connected = true
        },
        async query(sql, parameters) {
            queries.push({ sql, parameters })
        },
        async end() {
            ended = true
        },
    }
    await assert.rejects(
        withExpiredInvitation(
            { postgresUrl: 'unused' },
            organizationId,
            'http://issuer',
            async token => {
                assert.equal(connected, true)
                assert.equal(queries[0].parameters.includes(token), false, 'Only token hash reaches persistence')
                assert.equal(queries[0].parameters[1], organizationId)
                assert.equal(queries[0].parameters[4].getTime(), 0)
                throw new Error('fixture failure')
            },
            () => client,
        ),
        /fixture failure/,
    )
    assert.match(queries[1].sql, /WHERE id = \$1 AND "organizationId" = \$2/)
    assert.deepEqual(queries[1].parameters, [queries[0].parameters[0], organizationId])
    assert.equal(ended, true)
})

test('pinned CLI executes invitation preview, replay, expiry, and header assertions without secret artifacts', async () => {
    const expiredToken = randomUUID()
    const invitations = new Map()
    const platformToken = randomUUID()
    const customerToken = randomUUID()
    const organizations = [
        {
            id: randomUUID(),
            name: 'Platform fixture',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ]
    let ownerEmail
    let failHeaders = false
    let baseUrl
    const server = createServer(async (request, response) => {
        const url = new URL(request.url, baseUrl)
        const pathname = url.pathname
        const reply = (status, body) => {
            response.writeHead(status, {
                'content-type': 'application/json',
                'cache-control': failHeaders ? 'public' : 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end(JSON.stringify(body))
        }
        let raw = ''
        for await (const chunk of request) raw += chunk
        if (pathname.endsWith('/protocol/openid-connect/token'))
            return reply(200, {
                access_token: new URLSearchParams(raw).get('client_id') === 'customer' ? customerToken : platformToken,
            })
        if (pathname === '/v1/organizations') {
            if (!request.headers.authorization) return reply(401, {})
            if (request.headers.authorization === `Bearer ${customerToken}`) return reply(403, {})
            if (request.method === 'GET') {
                const size = Number(url.searchParams.get('pageSize') ?? 50)
                const cursor = url.searchParams.get('pageToken')
                if (!Number.isInteger(size) || size < 1 || size > 100 || (cursor && !/^page-\d+$/.test(cursor)))
                    return reply(400, {})
                const offset = cursor ? Number(cursor.slice(5)) : 0
                return reply(200, {
                    organizations: organizations.slice(offset, offset + size),
                    ...(offset + size < organizations.length ? { nextPageToken: `page-${offset + size}` } : {}),
                })
            }
            const body = JSON.parse(raw)
            if (!body.name || body.ownerEmail === 'invalid') return reply(400, {})
            const token = randomBytes(32).toString('base64url')
            const organizationId = randomUUID()
            organizations.unshift({
                id: organizationId,
                name: body.name,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            invitations.set(token, {
                organizationId,
                organizationName: body.name,
                email: body.ownerEmail,
                role: 'owner',
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                status: 'pending',
            })
            return reply(201, { organizationId, invitation: { token, role: 'owner', email: body.ownerEmail } })
        }
        const match = /^\/v1\/organizations\/invitations\/([^/]+)(\/accept)?$/.exec(pathname)
        if (!match) return reply(403, {})
        const [, token, acceptance] = match
        const invitation = invitations.get(token)
        if (token === expiredToken) return reply(410, { code: 'invitation_expired' })
        if (!invitation) return reply(404, {})
        if (!acceptance) {
            if (invitation.status === 'accepted') return reply(410, { code: 'invitation_consumed' })
            const preview = { ...invitation }
            delete preview.organizationId
            return reply(200, preview)
        }
        if (invitation.status === 'accepted') return reply(201, { status: 'accepted' })
        if (invitation.email === ownerEmail) return reply(409, {})
        const body = JSON.parse(raw)
        if (body.password.length < 12) return reply(400, {})
        ownerEmail = invitation.email
        invitation.status = 'accepted'
        return reply(201, { organizationId: invitation.organizationId, role: 'owner', membershipId: randomUUID() })
    })
    await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const environment = {
        BRUNO_API_URL: baseUrl,
        OIDC_ISSUER_URL: baseUrl,
        PLATFORM_API_KEY: platformToken,
        BRUNO_EXPIRED_INVITATION_TOKEN: expiredToken,
        CUSTOMER_API_KEY: customerToken,
    }
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-invitation-cli-'))
    const previous = process.env.TMPDIR
    process.env.TMPDIR = directory
    try {
        assert.deepEqual(await executeCollection('organization-onboarding', environment, root), {
            requests: 23,
            tests: 23,
        })
        assert.deepEqual(await readdir(directory), [])
        failHeaders = true
        await assert.rejects(executeCollection('organization-onboarding', environment, root), /raw output is withheld/)
        assert.deepEqual(await readdir(directory), [])
    } finally {
        if (previous === undefined) delete process.env.TMPDIR
        else process.env.TMPDIR = previous
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
        await rm(directory, { recursive: true, force: true })
    }
})
