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
    ])
    assert.deepEqual(browser.servers, [{ url: '/' }])
    for (const fragment of ['credit-purchases', 'verify', 'proxies']) {
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
