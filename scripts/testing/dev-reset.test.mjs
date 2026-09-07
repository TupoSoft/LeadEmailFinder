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

function runReset(scenario, args = ['--confirm-project=LEF'], input = '', inheritedEnvironment = {}) {
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
    const tailLog = resolve(directory, 'tail.jsonl')
    const developmentStackFile = resolve(testCheckout, '.dev/keycloak/development-stack.json')
    if (scenario === 'complete') {
        mkdirSync(resolve(testCheckout, 'scripts/testing'), { recursive: true })
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
if (scenario === 'complete') appendFileSync(process.env.RESET_TEST_TAIL_LOG, JSON.stringify({ tool: 'docker', args }) + '\\n');
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
    if (scenario === 'complete' && serviceFilter) {
        if (args.includes('label=com.docker.compose.project=lef')) console.log(String(services.indexOf(serviceFilter.split('=').at(-1)) + 1).repeat(64));
    } else if (scenario !== 'orphan-volumes') console.log('synthetic-container');
}
else if (scenario === 'complete' && args[0] === 'inspect' && args.some(arg => arg.startsWith('--format'))) console.log('healthy');
else if (scenario === 'complete' && args[0] === 'inspect' && /^[1-5]{64}$/.test(args[1])) console.log(JSON.stringify([ownedContainer(services[Number(args[1][0]) - 1])]));
else if (args[0] === 'inspect') console.log(JSON.stringify([{ Config: { Labels: {
    'com.docker.compose.project': 'lef',
    'com.docker.compose.project.working_dir': scenario === 'foreign-checkout' ? '/another/checkout' : process.env.RESET_TEST_ROOT + '/docker',
    'com.docker.compose.project.config_files': process.env.RESET_TEST_ROOT + '/docker/compose.yaml' + (scenario === 'overlay' ? ',/another/compose.yaml' : '')
} } }]));
else if (args[0] === 'volume' && args[1] === 'ls') { if (scenario !== 'fresh') console.log(scenario === 'partial-volumes' ? 'lef_postgres-data' : 'lef_postgres-data\\nlef_redis-data\\nlef_keycloak-postgres-data'); }
else if (args[0] === 'volume' && args[1] === 'inspect') console.log(JSON.stringify([{ Labels: { 'com.docker.compose.project': scenario === 'foreign-volume' ? 'other' : 'lef' } }]));
else if (args.includes('up') && scenario !== 'complete') process.exit(77);
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
                RESET_TEST_TAIL_LOG: tailLog,
                RESET_TEST_SCENARIO: scenario,
                ...inheritedEnvironment,
            },
        })
        const calls = readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        return {
            ...result,
            calls,
            tail: existsSync(tailLog) ? readFileSync(tailLog, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [],
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
    const discovery = result.tail.findIndex(event => event.tool === 'docker' &&
        event.args.some(arg => arg.startsWith('label=com.docker.compose.service=')))
    const firstSeed = result.tail.findIndex(event => event.command === 'keycloak:bootstrap-credential')
    assert.ok(webReady >= 0 && discovery > webReady && firstSeed > discovery)
    assert.equal(result.developmentStack.composeProject, 'lef')
    assert.equal(result.developmentStack.apiUrl, expectedEnvironment.API_URL)
    assert.equal(result.developmentStack.keycloakUrl, expectedEnvironment.KEYCLOAK_URL)
})
