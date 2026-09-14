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
const readinessHelper = 'scripts/testing/wait-container-healthy.mjs'

function readEvents(file) {
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}

function readinessCalls(result) {
    return result.tail.filter(event => event.tool === 'node' && event.args[0] === readinessHelper)
        .map(event => event.args.slice(1))
}

function runReset(scenario, args = ['--confirm-project=LEF'], input = '', inheritedEnvironment = {}) {
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-reset-test-'))
    const testCheckout = resolve(directory, 'checkout')
    mkdirSync(resolve(testCheckout, 'docker/scripts'), { recursive: true })
    mkdirSync(resolve(testCheckout, '.dev/keycloak'), { recursive: true })
    copyFileSync(
        resolve(checkoutRoot, 'docker/scripts/dev-reset.sh'),
        resolve(testCheckout, 'docker/scripts/dev-reset.sh'),
    )
    mkdirSync(resolve(testCheckout, 'scripts/testing'), { recursive: true })
    copyFileSync(resolve(checkoutRoot, readinessHelper), resolve(testCheckout, readinessHelper))
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
    const tailLog = resolve(directory, 'tail.jsonl')
    const developmentStackFile = resolve(testCheckout, '.dev/keycloak/development-stack.json')
    const startsStack = ['complete', 'postgres-dead', 'keycloak-dead', 'keycloak-starting'].includes(scenario)
    writeFileSync(resolve(directory, 'node'), `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.RESET_TEST_TAIL_LOG, JSON.stringify({ tool: 'node', args }) + '\\n');
const result = spawnSync(${JSON.stringify(process.execPath)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o700 })
    if (startsStack) {
        for (const script of ['development-stack.mjs', 'refresh-development-stack.mjs']) {
            copyFileSync(resolve(checkoutRoot, 'scripts/testing', script), resolve(testCheckout, 'scripts/testing', script))
        }
        mkdirSync(resolve(testCheckout, 'docker/secrets'), { recursive: true })
        writeFileSync(resolve(testCheckout, 'docker/secrets/postgres_password.txt'), 'synthetic-password', { mode: 0o600 })
        writeFileSync(developmentStackFile, JSON.stringify({
            checkoutRoot: testCheckout,
            composeProject: 'lef5048fb9',
            apiUrl: 'http://localhost:53101',
            keycloakUrl: 'http://localhost:58101',
            postgresUrl: 'postgresql://postgres:synthetic-password@localhost:55441/lef',
            redisUrl: 'redis://localhost:56391',
            keycloakAdminUsername: 'admin',
            keycloakAdminPassword: 'synthetic-admin-password',
        }), { mode: 0o600 })
        writeFileSync(resolve(directory, 'pnpm'), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const command = process.argv[2];
const file = process.env.RESET_TEST_ROOT + '/.dev/keycloak/development-stack.json';
const metadata = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
appendFileSync(process.env.RESET_TEST_TAIL_LOG, JSON.stringify({
    tool: 'pnpm', command,
    environment: Object.fromEntries(['COMPOSE_PROJECT_NAME', 'KEYCLOAK_URL', 'KEYCLOAK_PUBLIC_URL', 'API_URL', 'KEYCLOAK_BFF_REDIRECT_URIS', 'KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS', 'OIDC_BACKCHANNEL_URL'].map(key => [key, process.env[key] ?? null])),
    metadata: metadata ? { composeProject: metadata.composeProject, apiUrl: metadata.apiUrl, keycloakUrl: metadata.keycloakUrl } : null,
}) + '\\n');
if (command === 'keycloak:bootstrap-credential') writeFileSync(process.env.RESET_TEST_ROOT + '/.dev/keycloak/service-client.json', JSON.stringify({
    issuer: 'http://localhost:58080/realms/lead-email-finder', clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
}));
if (command === 'keycloak:seed-customer-fixture') writeFileSync(process.env.RESET_TEST_ROOT + '/.dev/keycloak/customer-fixture.json', JSON.stringify({ organizationId: 'synthetic-organization' }));
`, { mode: 0o700 })
        writeFileSync(resolve(directory, 'curl'), `#!${process.execPath}
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.RESET_TEST_TAIL_LOG, JSON.stringify({ tool: 'curl', args: process.argv.slice(2) }) + '\\n');
const url = process.argv.at(-1);
if (url.endsWith('/protocol/openid-connect/token')) process.stdout.write(JSON.stringify({ access_token: 'synthetic-token' }));
else if (url.includes('/credits/')) process.stdout.write(JSON.stringify({ balance: 1000 }));
else process.stdout.write('Synthetic gateway page');
`, { mode: 0o700 })
    }
    const docker = resolve(directory, 'docker')
    writeFileSync(
        docker,
        `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.RESET_TEST_LOG, JSON.stringify(args) + '\\n');
const scenario = process.env.RESET_TEST_SCENARIO;
const startsStack = process.env.RESET_TEST_STARTS_STACK === 'true';
appendFileSync(process.env.RESET_TEST_TAIL_LOG, JSON.stringify({ tool: 'docker', args }) + '\\n');
const services = ['api', 'web', 'postgres', 'redis', 'keycloak'];
function ownedContainer(service) {
    const root = process.env.RESET_TEST_ROOT;
    return {
        Config: {
            Labels: {
                'com.docker.compose.project': 'lef',
                'com.docker.compose.service': service,
                'com.docker.compose.project.working_dir': root + '/docker',
                'com.docker.compose.project.config_files': root + '/docker/compose.yaml',
            },
            Env: service === 'postgres' ? ['POSTGRES_USER=postgres', 'POSTGRES_DB=lef']
                : service === 'keycloak' ? ['KC_BOOTSTRAP_ADMIN_USERNAME=admin', 'KC_BOOTSTRAP_ADMIN_PASSWORD=synthetic-admin-password'] : [],
        },
        State: { Running: true },
        Mounts: service === 'api' ? [{ Type: 'bind', Source: root, Destination: '/app' }]
            : service === 'postgres' ? [{ Type: 'bind', Source: root + '/docker/secrets/postgres_password.txt', Destination: '/run/secrets/postgres_password' }] : [],
        NetworkSettings: { Ports: {
            '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: service === 'keycloak' ? '58080' : '53000' }],
            '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }],
            '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '56379' }],
        } },
    };
}
if (args.includes('config')) console.log(JSON.stringify({ name: 'lef', services: {
    web: { ports: [{ target: 8080, published: scenario === 'alternate-ports' ? '53101' : '53000' }] },
    keycloak: { ports: [{ target: 8080, published: '58080' }] },
    postgres: { ports: [{ target: 5432, published: '55432' }] }
} }));
else if (args[0] === 'ps') {
    const serviceFilter = args.find(arg => arg.startsWith('label=com.docker.compose.service='));
    if (startsStack && serviceFilter) {
        if (args.includes('label=com.docker.compose.project=lef')) console.log(String(services.indexOf(serviceFilter.split('=').at(-1)) + 1).repeat(64));
    } else if (scenario !== 'orphan-volumes') console.log('synthetic-container');
}
else if (startsStack && args[0] === 'inspect' && args.some(arg => arg.startsWith('--format'))) {
    const container = args.at(-1);
    const dead = (scenario === 'postgres-dead' && container === 'lef-postgres-1') ||
        (scenario === 'keycloak-dead' && container === 'lef-keycloak-1');
    const starting = scenario === 'keycloak-starting' && container === 'lef-keycloak-1';
    console.log(dead ? 'dead\\tnone' : starting ? 'running\\tstarting' : 'running\\thealthy');
}
else if (startsStack && args[0] === 'inspect' && /^[1-5]{64}$/.test(args[1])) console.log(JSON.stringify([ownedContainer(services[Number(args[1][0]) - 1])]));
else if (args[0] === 'inspect') console.log(JSON.stringify([{ Config: { Labels: {
    'com.docker.compose.project': 'lef',
    'com.docker.compose.project.working_dir': scenario === 'foreign-checkout' ? '/another/checkout' : process.env.RESET_TEST_ROOT + '/docker',
    'com.docker.compose.project.config_files': process.env.RESET_TEST_ROOT + '/docker/compose.yaml' + (scenario === 'overlay' ? ',/another/compose.yaml' : '')
} } }]));
else if (args[0] === 'volume' && args[1] === 'ls') { if (scenario !== 'fresh') console.log(scenario === 'partial-volumes' ? 'lef_postgres-data' : 'lef_postgres-data\\nlef_redis-data\\nlef_keycloak-postgres-data'); }
else if (args[0] === 'volume' && args[1] === 'inspect') console.log(JSON.stringify([{ Labels: { 'com.docker.compose.project': scenario === 'foreign-volume' ? 'other' : 'lef' } }]));
else if (args.includes('up') && !startsStack) process.exit(77);
`,
    )
    chmodSync(docker, 0o700)
    try {
        const environment = { ...process.env }
        delete environment.DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS
        const result = spawnSync('sh', ['docker/scripts/dev-reset.sh', ...args], {
            cwd: testCheckout,
            encoding: 'utf8',
            input,
            timeout: 30000,
            env: {
                ...environment,
                PATH: `${directory}:${process.env.PATH}`,
                RESET_TEST_ROOT: testCheckout,
                RESET_TEST_LOG: log,
                RESET_TEST_TAIL_LOG: tailLog,
                RESET_TEST_SCENARIO: scenario,
                RESET_TEST_STARTS_STACK: String(startsStack),
                ...inheritedEnvironment,
            },
        })
        return {
            ...result,
            calls: readEvents(log),
            tail: readEvents(tailLog),
            developmentStack: existsSync(developmentStackFile) ? JSON.parse(readFileSync(developmentStackFile, 'utf8')) : undefined,
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

for (const timeout of ['', '0', '-1', '601', '1.5', '1e2', ' 300', '300 ', '0300', '+300', 'invalid', '\n', '300\n']) {
    test(`reset rejects Keycloak timeout ${JSON.stringify(timeout)} before Docker calls or fixture deletion`, () => {
        const result = runReset('complete', ['--confirm-project=LEF'], '', {
            DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS: timeout,
        })
        assert.equal(result.status, 1, result.stderr)
        assert.deepEqual(result.calls, [])
        assert.deepEqual(readinessCalls(result), [['--validate-timeout', timeout]])
        assert.ok(result.browserUsersPreserved)
        assert.ok(result.seedMetadataPreserved)
        assert.equal(result.developmentStack.composeProject, 'lef5048fb9')
        assert.ok(!result.tail.some(event => event.tool === 'pnpm' || event.tool === 'curl'))
    })
}

test('reset passes an explicit Keycloak timeout to the real helper and preserves other budgets', () => {
    const result = runReset('complete', ['--confirm-project=LEF'], '', {
        DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS: '120',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(readinessCalls(result), [
        ['--validate-timeout', '120'],
        ['lef-postgres-1', '120'],
        ['lef-redis-1', '120'],
        ['lef-garage-1', '120'],
        ['lef-keycloak-postgres-1', '120'],
        ['lef-keycloak-1', '120'],
        ['lef-api-1', '120'],
        ['lef-web-1', '120'],
    ])
    assert.match(result.stdout, /Container lef-keycloak-1: budget=120s .* status=healthy outcome=healthy/)
    assert.match(result.stdout, /Authenticated API smoke test passed:/)
})

for (const scenario of ['postgres-dead', 'keycloak-dead', 'keycloak-starting']) {
    test(`reset stops before provisioning and seeds when infrastructure is ${scenario}`, () => {
        const result = runReset(scenario, ['--confirm-project=LEF'], '', {
            DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS: '1',
        })
        assert.equal(result.status, 1, result.stderr)
        assert.ok(result.calls.some(args => args.includes('up')))
        assert.ok(!result.tail.some(event => event.tool === 'pnpm' || event.tool === 'curl'))
        assert.ok(!readinessCalls(result).some(args => ['lef-api-1', 'lef-web-1'].includes(args[0])))
        assert.equal(result.developmentStack.composeProject, 'lef5048fb9')
        assert.ok(result.seedMetadataPreserved)
        if (scenario === 'postgres-dead') {
            assert.deepEqual(readinessCalls(result), [['--validate-timeout', '1'], ['lef-postgres-1', '120']])
            assert.match(result.stderr, /Container lef-postgres-1: budget=120s .* status=dead outcome=dead/)
        } else {
            assert.deepEqual(readinessCalls(result).at(-1), ['lef-keycloak-1', '1'])
            assert.match(result.stderr, scenario === 'keycloak-dead'
                ? /Container lef-keycloak-1: budget=1s .* status=dead outcome=dead/
                : /Container lef-keycloak-1: budget=1s .* status=starting outcome=timeout/)
        }
    })
}

test('a successful default reset replaces stale isolated metadata before human seeds and overrides inherited endpoints', () => {
    const result = runReset('complete', ['--confirm-project=LEF'], '', {
        COMPOSE_PROJECT_NAME: 'lef5048fb9',
        KEYCLOAK_URL: 'http://localhost:58101',
        KEYCLOAK_PUBLIC_URL: 'http://localhost:58101',
        API_URL: 'http://localhost:53101',
        KEYCLOAK_BFF_REDIRECT_URIS: 'http://localhost:53101/v1/auth/callback',
        KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS: 'http://localhost:53101/',
        OIDC_BACKCHANNEL_URL: 'http://localhost:58101/realms/lead-email-finder',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Development stack reset complete\./)
    assert.match(result.stdout, /Authenticated API smoke test passed: organization synthetic-organization has balance 1000/)
    assert.deepEqual(readinessCalls(result), [
        ['--validate-timeout', '300'],
        ['lef-postgres-1', '120'],
        ['lef-redis-1', '120'],
        ['lef-garage-1', '120'],
        ['lef-keycloak-postgres-1', '120'],
        ['lef-keycloak-1', '300'],
        ['lef-api-1', '120'],
        ['lef-web-1', '120'],
    ])
    assert.match(result.stdout, /Container lef-keycloak-1: budget=300s .* status=healthy outcome=healthy/)
    for (const container of ['postgres', 'redis', 'garage', 'keycloak-postgres', 'api', 'web']) {
        assert.match(result.stdout, new RegExp(`Container lef-${container}-1: budget=120s .* status=healthy outcome=healthy`))
    }
    assert.equal(result.browserUsersPreserved, false)
    assert.ok(result.seedMetadataPreserved)
    const expectedEnvironment = {
        COMPOSE_PROJECT_NAME: 'lef',
        KEYCLOAK_URL: 'http://localhost:58080',
        KEYCLOAK_PUBLIC_URL: 'http://localhost:58080',
        API_URL: 'http://localhost:53000',
        KEYCLOAK_BFF_REDIRECT_URIS: 'http://localhost:53000/v1/auth/callback',
        KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS: 'http://localhost:53000/',
        OIDC_BACKCHANNEL_URL: null,
    }
    const commands = result.tail.filter(event => event.tool === 'pnpm')
    assert.deepEqual(commands.map(event => event.command), [
        'keycloak:provision',
        'keycloak:bootstrap-credential',
        'keycloak:bootstrap-operator',
        'keycloak:seed-customer-fixture',
        'keycloak:smoke',
    ])
    for (const command of commands) assert.deepEqual(command.environment, expectedEnvironment)
    assert.equal(commands[0].metadata.composeProject, 'lef5048fb9')
    for (const command of commands.slice(1)) {
        assert.deepEqual(command.metadata, {
            composeProject: 'lef', apiUrl: expectedEnvironment.API_URL, keycloakUrl: expectedEnvironment.KEYCLOAK_URL,
        })
    }
    const webReady = result.tail.findIndex(event => event.tool === 'docker' &&
        event.args[0] === 'inspect' && event.args.includes('lef-web-1'))
    const keycloakReady = result.tail.findIndex(event => event.tool === 'docker' &&
        event.args[0] === 'inspect' && event.args.includes('lef-keycloak-1'))
    const provision = result.tail.findIndex(event => event.command === 'keycloak:provision')
    const apiReady = result.tail.findIndex(event => event.tool === 'docker' &&
        event.args[0] === 'inspect' && event.args.includes('lef-api-1'))
    const discovery = result.tail.findIndex(event => event.tool === 'docker' &&
        event.args.some(arg => arg.startsWith('label=com.docker.compose.service=')))
    const firstSeed = result.tail.findIndex(event => event.command === 'keycloak:bootstrap-credential')
    const customerSeed = result.tail.findIndex(event => event.command === 'keycloak:seed-customer-fixture')
    const smoke = result.tail.findIndex(event => event.command === 'keycloak:smoke')
    const tokenRequest = result.tail.findIndex(event => event.tool === 'curl' &&
        event.args.at(-1).endsWith('/protocol/openid-connect/token'))
    const creditRequest = result.tail.findIndex(event => event.tool === 'curl' &&
        event.args.at(-1).endsWith('/credits/synthetic-organization'))
    assert.ok(keycloakReady >= 0 && provision > keycloakReady && apiReady > provision && webReady > apiReady)
    assert.ok(webReady >= 0 && discovery > webReady && firstSeed > discovery)
    assert.ok(customerSeed > firstSeed && smoke > customerSeed && tokenRequest > smoke && creditRequest > tokenRequest)
    assert.ok(result.tail[creditRequest].args.includes('Authorization: Bearer synthetic-token'))
    assert.equal(result.developmentStack.composeProject, 'lef')
    assert.equal(result.developmentStack.apiUrl, expectedEnvironment.API_URL)
    assert.equal(result.developmentStack.keycloakUrl, expectedEnvironment.KEYCLOAK_URL)
})
