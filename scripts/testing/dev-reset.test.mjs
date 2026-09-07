import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const checkoutRoot = resolve(import.meta.dirname, '../..')

function runReset(scenario, args = ['--confirm-project=LEF'], input = '') {
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-reset-test-'))
    const testCheckout = resolve(directory, 'checkout')
    mkdirSync(resolve(testCheckout, 'docker/scripts'), { recursive: true })
    mkdirSync(resolve(testCheckout, '.dev/keycloak'), { recursive: true })
    copyFileSync(
        resolve(checkoutRoot, 'docker/scripts/dev-reset.sh'),
        resolve(testCheckout, 'docker/scripts/dev-reset.sh'),
    )
    const browserUsers = resolve(testCheckout, '.dev/keycloak/browser-users.json')
    const seedMetadata = resolve(testCheckout, '.dev/keycloak/browser-seed.json')
    writeFileSync(browserUsers, 'synthetic enrollment metadata')
    writeFileSync(seedMetadata, 'nonsecret seed metadata')
    if (scenario === 'symlink-directory') {
        rmSync(resolve(testCheckout, '.dev/keycloak'), { recursive: true })
        const external = resolve(directory, 'external')
        mkdirSync(external)
        writeFileSync(resolve(external, 'browser-users.json'), 'synthetic enrollment metadata')
        writeFileSync(resolve(external, 'browser-seed.json'), 'nonsecret seed metadata')
        symlinkSync(external, resolve(testCheckout, '.dev/keycloak'))
    }
    const log = resolve(directory, 'calls.jsonl')
    const docker = resolve(directory, 'docker')
    writeFileSync(
        docker,
        `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.RESET_TEST_LOG, JSON.stringify(args) + '\\n');
const scenario = process.env.RESET_TEST_SCENARIO;
if (args.includes('config')) console.log(JSON.stringify({ name: 'lef', services: {
    web: { ports: [{ target: 8080, published: scenario === 'alternate-ports' ? '53101' : '53000' }] },
    keycloak: { ports: [{ target: 8080, published: '58080' }] },
    postgres: { ports: [{ target: 5432, published: '55432' }] }
} }));
else if (args[0] === 'ps') { if (scenario !== 'orphan-volumes') console.log('synthetic-container'); }
else if (args[0] === 'inspect') console.log(JSON.stringify([{ Config: { Labels: {
    'com.docker.compose.project': 'lef',
    'com.docker.compose.project.working_dir': scenario === 'foreign-checkout' ? '/another/checkout' : process.env.RESET_TEST_ROOT + '/docker',
    'com.docker.compose.project.config_files': process.env.RESET_TEST_ROOT + '/docker/compose.yaml' + (scenario === 'overlay' ? ',/another/compose.yaml' : '')
} } }]));
else if (args[0] === 'volume' && args[1] === 'ls') { if (scenario !== 'fresh') console.log(scenario === 'partial-volumes' ? 'lef_postgres-data' : 'lef_postgres-data\\nlef_redis-data\\nlef_keycloak-postgres-data'); }
else if (args[0] === 'volume' && args[1] === 'inspect') console.log(JSON.stringify([{ Labels: { 'com.docker.compose.project': scenario === 'foreign-volume' ? 'other' : 'lef' } }]));
else if (args.includes('up')) process.exit(77);
`,
    )
    chmodSync(docker, 0o700)
    try {
        const result = spawnSync('sh', ['docker/scripts/dev-reset.sh', ...args], {
            cwd: testCheckout,
            encoding: 'utf8',
            input,
            env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                RESET_TEST_ROOT: testCheckout,
                RESET_TEST_LOG: log,
                RESET_TEST_SCENARIO: scenario,
            },
        })
        const calls = readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        return {
            ...result,
            calls,
            browserUsersPreserved: existsSync(browserUsers),
            seedMetadataPreserved: existsSync(seedMetadata),
        }
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
}

for (const scenario of [
    'foreign-checkout',
    'overlay',
    'foreign-volume',
    'partial-volumes',
    'orphan-volumes',
    'alternate-ports',
    'symlink-directory',
]) {
    test(`reset refuses ${scenario} before stopping containers or deleting volumes`, () => {
        const result = runReset(scenario)
        assert.equal(result.status, 1)
        assert.match(result.stderr, /Refusing/)
        assert.ok(!result.calls.some(args => args.includes('down') || args.includes('rm') || args.includes('up')))
        assert.ok(result.browserUsersPreserved)
        assert.ok(result.seedMetadataPreserved)
    })
}

test('reset requires the exact explicit project confirmation', () => {
    for (const result of [runReset('owned', ['--confirm-project=other']), runReset('owned', [], 'no\n')]) {
        assert.equal(result.status, 1)
        assert.equal(result.calls.length, 1)
        assert.ok(result.browserUsersPreserved)
    }
})

test('an owned reset deletes only its fixed volume list before starting the stack', () => {
    const result = runReset('owned')
    assert.equal(result.status, 77)
    assert.deepEqual(
        result.calls.find(args => args[0] === 'volume' && args[1] === 'rm'),
        ['volume', 'rm', 'lef_postgres-data', 'lef_redis-data', 'lef_keycloak-postgres-data'],
    )
    assert.ok(result.calls.some(args => args.includes('up')))
    assert.match(result.stdout, /lef-web-1/)
    assert.equal(result.browserUsersPreserved, false)
    assert.ok(result.seedMetadataPreserved)
})

test('a confirmed first reset removes only the browser enrollment file before recreating the realm', () => {
    const result = runReset('fresh')
    assert.equal(result.status, 77)
    assert.equal(result.browserUsersPreserved, false)
    assert.ok(result.seedMetadataPreserved)
})
