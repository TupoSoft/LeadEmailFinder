import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
    assertTrackedArtifacts,
    checkArtifacts,
    exportDocuments,
    generateSchema,
    rootDirectory,
    snapshotPath,
    schemaPath,
} from './contracts.mjs'

const require = createRequire(import.meta.url)

let directory
let browser
let runtime
before(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'lef-contract-test-'))
    exportDocuments(directory, {})
    browser = JSON.parse(await readFile(resolve(directory, 'browser.json'), 'utf8'))
    runtime = JSON.parse(await readFile(resolve(directory, 'runtime.json'), 'utf8'))
})
after(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
})

test('blocks TCP, listeners, UDP creation, and callback/promise DNS before network I/O', () => {
    execFileSync(
        process.execPath,
        [
            '-r',
            require.resolve('ts-node/register/transpile-only'),
            '-e',
            `
        const assert = require('node:assert/strict');
        require('./scripts/openapi/deny-network').denyNetwork();
        const net = require('node:net');
        const dns = require('node:dns');
        const promises = require('node:dns/promises');
        for (const attempt of [
            () => net.connect(9, '127.0.0.1'),
            () => net.createServer().listen(0),
            () => require('node:dgram').createSocket('udp4'),
            () => dns.lookup('metadata.invalid', () => {}),
            () => dns.resolveMx('metadata.invalid', () => {}),
            () => promises.resolveMx('metadata.invalid'),
            () => new dns.Resolver().resolveMx('metadata.invalid', () => {}),
            () => new promises.Resolver().resolveMx('metadata.invalid'),
        ]) assert.throws(attempt, { message: 'Network I/O is forbidden during OpenAPI export' });
    `,
        ],
        { cwd: rootDirectory, stdio: 'pipe' },
    )
})

test('rejects generated artifacts that exist but are not tracked in Git', async () => {
    const repository = await mkdtemp(resolve(tmpdir(), 'lef-untracked-test-'))
    try {
        execFileSync('git', ['init', '--quiet'], { cwd: repository })
        await writeFile(resolve(repository, 'browser.json'), '{}')
        await writeFile(resolve(repository, 'schema.d.ts'), 'export {}')
        assert.throws(() => assertTrackedArtifacts(repository, ['browser.json', 'schema.d.ts']), /must be tracked/)
        execFileSync('git', ['add', 'browser.json', 'schema.d.ts'], { cwd: repository })
        assert.doesNotThrow(() => assertTrackedArtifacts(repository, ['browser.json', 'schema.d.ts']))
    } finally {
        await rm(repository, { recursive: true, force: true })
    }
})

test('exports the real app from an empty environment without provider construction or network I/O', () => {
    assert.deepEqual(Object.keys(browser.paths), [
        '/health',
        '/v1/auth/callback',
        '/v1/auth/login',
        '/v1/auth/logout',
        '/v1/auth/session',
        '/v1/billing/credit-packs',
        '/v1/billing/summary',
        '/v1/credit-purchases',
    ])
    assert.deepEqual(browser.servers, [{ url: '/' }])
    for (const fragment of ['verify', 'proxies']) {
        assert.ok(
            Object.keys(runtime.paths).some(path => path.includes(fragment)),
            `Full runtime docs retain ${fragment}`,
        )
        assert.ok(Object.keys(browser.paths).every(path => !path.includes(fragment)))
    }
    const account = browser.components.schemas.CurrentAccountContextDto
    assert.equal(account.properties.email.nullable, true)
    for (const secret of ['credentialId', 'sessionId', 'accessToken', 'refreshToken', 'idToken', 'csrfToken']) {
        assert.equal(Object.hasOwn(account.properties, secret), false)
    }
    assert.deepEqual(browser.paths['/v1/auth/session'].get.security, [{ lef_session: [] }])
    for (const code of ['200', '401', '403']) assert.ok(browser.paths['/v1/auth/session'].get.responses[code])
})

test('billing exposes exactly the consumed methods and safe customer fields through generated types', async () => {
    const billing = Object.entries(browser.paths)
        .filter(([path]) => path.includes('/billing/') || path.includes('credit-purchases'))
        .flatMap(([path, item]) => Object.keys(item).map(method => `${method.toUpperCase()} ${path}`))
        .sort()
    assert.deepEqual(billing, [
        'GET /v1/billing/credit-packs',
        'GET /v1/billing/summary',
        'GET /v1/credit-purchases',
        'POST /v1/credit-purchases',
    ])
    const schemas = browser.components.schemas
    assert.deepEqual(Object.keys(schemas.BillingCreditPackResponseDto.properties).sort(), [
        'amountMinor',
        'credits',
        'currency',
        'id',
    ])
    assert.deepEqual(Object.keys(schemas.CreditPurchaseResponseDto.properties).sort(), [
        'amountMinor',
        'createdAt',
        'credits',
        'currency',
        'id',
        'packId',
        'status',
        'updatedAt',
    ])
    assert.deepEqual(Object.keys(schemas.CreateCreditPurchaseDto.properties), ['packId'])
    assert.deepEqual(Object.keys(schemas.CreditResponseDto.properties), ['balance'])
    const generated = await readFile(schemaPath, 'utf8')
    for (const field of ['providerPriceId', 'providerReference', 'provider:', 'webhookId', 'eventId', 'rawPayload']) {
        assert.equal(JSON.stringify(browser).includes(`"${field.replace(':', '')}"`), false, field)
        assert.equal(generated.includes(field), false, field)
    }
    for (const [path, method] of [
        ['/v1/billing/summary', 'get'],
        ['/v1/billing/credit-packs', 'get'],
        ['/v1/credit-purchases', 'get'],
        ['/v1/credit-purchases', 'post'],
    ]) {
        assert.match(generated, new RegExp(browser.paths[path][method].operationId))
        assert.deepEqual(
            browser.paths[path][method].security,
            method === 'post'
                ? [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }]
                : [{ lef_session: [] }, { oidc: [] }],
        )
        for (const code of ['401', '403']) assert.ok(browser.paths[path][method].responses[code])
    }
})

test('runtime verification docs retain the current POST contract and omit the retired GET contract', () => {
    const verification = runtime.paths['/verify']
    assert.ok(verification.post)
    assert.equal(Object.hasOwn(verification, 'get'), false)
    assert.notEqual(verification.post.deprecated, true)
    assert.deepEqual(verification.post.requestBody.content['application/json'].schema, {
        $ref: '#/components/schemas/EmailVerificationRequestDto',
    })
    assert.deepEqual(verification.post.responses['201'].content['application/json'].schema, {
        $ref: '#/components/schemas/EmailVerificationResponseDto',
    })
    assert.equal(Object.hasOwn(verification.post.responses, '200'), false)

    const schemas = runtime.components.schemas
    assert.equal(Object.hasOwn(schemas, 'OldSyncEmailVerificationRequestQueryDto'), false)
    assert.equal(Object.hasOwn(schemas, 'OldSyncEmailVerificationResponseDto'), false)
    assert.equal(schemas.EmailVerificationRequestDto.properties.email.type, 'string')
    const response = schemas.EmailVerificationResponseDto
    assert.deepEqual(Object.keys(response.properties).sort(), [
        'catchAll', 'createdAt', 'domain', 'email', 'exists', 'format', 'id', 'localPart', 'mxDomain',
        'reason', 'sources', 'targetExchange',
    ])
    assert.equal(response.properties.id.type, 'string')
    assert.equal(response.properties.email.type, 'string')
    assert.equal(response.properties.sources.type, 'array')
})

test('ambient configuration and secret-file settings cannot change the export', async () => {
    const second = await mkdtemp(resolve(tmpdir(), 'lef-contract-ambient-'))
    try {
        exportDocuments(second, {
            NODE_ENV: 'production',
            API_URL: 'https://unexpected.invalid',
            POSTGRES_URL_FILE: '/missing/private-value',
            PAYMENTS_PROVIDER: 'invalid',
            NODE_OPTIONS: '',
        })
        assert.equal(
            await readFile(resolve(second, 'browser.json'), 'utf8'),
            await readFile(resolve(directory, 'browser.json'), 'utf8'),
        )
    } finally {
        await rm(second, { recursive: true, force: true })
    }
})

test('checks committed artifacts byte for byte and leaves them untouched', async () => {
    const before = await Promise.all([readFile(snapshotPath), readFile(schemaPath)])
    await checkArtifacts(directory)
    assert.deepEqual(await Promise.all([readFile(snapshotPath), readFile(schemaPath)]), before)
})

test('rejects missing or stale JSON and TypeScript without repairing either file', async () => {
    const snapshot = resolve(directory, 'committed.json')
    const schema = resolve(directory, 'committed.d.ts')
    for (const missing of ['json', 'typescript']) {
        await copyFile(resolve(directory, 'browser.json'), snapshot)
        await generateSchema(snapshot, schema)
        await rm(missing === 'json' ? snapshot : schema)
        await assert.rejects(checkArtifacts(directory, snapshot, schema), /Missing OpenAPI artifact/)
        assert.equal(
            (await readdir(directory)).includes(missing === 'json' ? 'committed.json' : 'committed.d.ts'),
            false,
        )
    }
    for (const stale of ['json', 'typescript']) {
        await copyFile(resolve(directory, 'browser.json'), snapshot)
        await generateSchema(snapshot, schema)
        const path = stale === 'json' ? snapshot : schema
        const original = await readFile(path, 'utf8')
        await writeFile(path, original + '\n')
        await assert.rejects(checkArtifacts(directory, snapshot, schema), /OpenAPI drift/)
        assert.equal(await readFile(path, 'utf8'), original + '\n')
    }
})
