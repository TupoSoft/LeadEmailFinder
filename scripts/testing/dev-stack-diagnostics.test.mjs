import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import {
    chmodSync,
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
    collectDiagnostics,
    projectInspection,
    SERVICES,
    summarizeStartupLogs,
} from './dev-stack-diagnostics.mjs'

const checkoutRoot = resolve(import.meta.dirname, '../..')
const expectedServices = ['keycloak', 'api', 'keycloak-postgres', 'postgres', 'redis', 'garage', 'web', 'bullboard']
const secret = 'SYNTHETIC_PRIVATE_DIAGNOSTIC_SENTINEL'
const markerNames = ['connection-refused', 'connection-timeout', 'name-resolution', 'memory-error', 'database-retry', 'startup-failed']
const idFor = service => String(expectedServices.indexOf(service) + 1).repeat(64)

function inspection(service = 'keycloak', overrides = {}) {
    return {
        project: 'lef',
        service,
        workingDir: resolve(checkoutRoot, 'docker'),
        configFiles: resolve(checkoutRoot, 'docker/compose.yaml'),
        state: { status: 'exited', oomKilled: true, exitCode: 137 },
        restartCount: 3,
        health: {
            status: 'unhealthy',
            failingStreak: 7,
            probes: [{ start: '2026-09-14T10:00:00.000Z', end: '2026-09-14T10:00:01.000Z', exitCode: 1 }],
        },
        ...overrides,
    }
}

function fakeAdapter(overrides = {}) {
    const calls = []
    const runCommand = async (args, options) => {
        calls.push({ args, options })
        let service
        if (args[0] === 'ps') {
            const filter = args.find(arg => arg.startsWith('label=com.docker.compose.service='))
            service = filter?.split('=').at(-1)
        } else {
            service = expectedServices.find(name => args.includes(idFor(name)))
        }
        assert.ok(service, `Unexpected Docker command: ${JSON.stringify(args)}`)
        const override = overrides[service]?.[args[0]]
        if (override !== undefined) return typeof override === 'function' ? override(args, options) : override
        if (args[0] === 'ps') return { ok: true, stdout: `${idFor(service)}\n` }
        if (args[0] === 'inspect') return { ok: true, stdout: JSON.stringify(inspection(service)) }
        assert.equal(args[0], 'logs')
        return { ok: true, stdout: 'Ready\n' }
    }
    return { runCommand, calls }
}

function assertClosedEnvelope(value) {
    assert.equal(value.schemaVersion, 1)
    assert.ok(['complete', 'partial'].includes(value.collectionStatus))
    assert.deepEqual(Object.keys(value.services), expectedServices)
    assert.deepEqual(Object.keys(value).sort(), ['collectionStatus', 'schemaVersion', 'services'])
    const encoded = JSON.stringify(value)
    assert.ok(Buffer.byteLength(encoded) <= 32_768)
    assert.ok(!encoded.includes(secret))
    assert.ok(!encoded.includes(checkoutRoot))
    for (const service of expectedServices) {
        const record = value.services[service]
        assert.ok(['collected', 'missing', 'ambiguous', 'foreign', 'unavailable'].includes(record.result))
        assert.ok(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'unknown'].includes(record.state))
        assert.ok(['starting', 'healthy', 'unhealthy', 'none', 'unknown'].includes(record.health))
        if (record.reason !== undefined) assert.ok(['timeout', 'output-limit', 'command-failed', 'invalid-data'].includes(record.reason))
        assert.ok(!encoded.includes(idFor(service)))
    }
}

test('projection retains stopped-container evidence and only the declared probe metadata', () => {
    const projected = projectInspection(inspection('keycloak', {
        extra: secret,
        env: [`PASSWORD=${secret}`],
        state: { status: 'exited', oomKilled: true, exitCode: 137, error: secret },
        health: {
            status: 'unhealthy', failingStreak: 7, command: secret,
            probes: Array.from({ length: 7 }, (_, index) => ({
                start: `2026-09-14T10:00:0${index}.000Z`,
                end: `2026-09-14T10:00:0${index}.500Z`,
                exitCode: index,
                Output: secret,
                output: secret,
            })),
        },
    }), 'keycloak', checkoutRoot)
    assert.deepEqual(projected, {
        result: 'collected', state: 'exited', health: 'unhealthy',
        oomKilled: true, exitCode: 137, restartCount: 3, failingStreak: 7,
        probes: Array.from({ length: 5 }, (_, index) => ({
            start: Date.parse(`2026-09-14T10:00:0${index + 2}.000Z`),
            end: Date.parse(`2026-09-14T10:00:0${index + 2}.500Z`),
            exitCode: index + 2,
        })),
    })
})

test('projection accepts both owned directories and maps all process and health states', () => {
    for (const workingDir of [checkoutRoot, resolve(checkoutRoot, 'docker')]) {
        for (const status of ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead']) {
            const projected = projectInspection(inspection('api', { workingDir, state: { status }, health: null }), 'api', checkoutRoot)
            assert.deepEqual(projected, { result: 'collected', state: status, health: 'none', restartCount: 3 })
        }
    }
    for (const health of ['starting', 'healthy', 'unhealthy', secret]) {
        const projected = projectInspection(inspection('api', { state: { status: secret }, health: { status: health } }), 'api', checkoutRoot)
        assert.equal(projected.state, 'unknown')
        assert.equal(projected.health, health === secret ? 'unknown' : health)
        assert.ok(!JSON.stringify(projected).includes(secret))
    }
})

test('invalid optional fields are omitted and supported numeric boundaries are retained', () => {
    for (const invalid of [-2, 256, 1.5, '1', null, secret]) {
        const projected = projectInspection(inspection('api', {
            state: { status: 'running', oomKilled: 'true', exitCode: invalid },
            restartCount: invalid === 256 ? 1_000_001 : invalid,
            health: {
                status: 'starting', failingStreak: invalid === 256 ? 1_000_001 : invalid,
                probes: [{ start: secret, end: 'not a timestamp', exitCode: invalid }],
            },
        }), 'api', checkoutRoot)
        for (const field of ['oomKilled', 'exitCode', 'restartCount', 'failingStreak']) {
            assert.equal(projected[field], undefined, field)
        }
        assert.ok(!JSON.stringify(projected).includes(secret))
        assert.ok((projected.probes ?? []).every(probe => Object.keys(probe).length === 0))
    }
    for (const exitCode of [-1, 255]) {
        const projected = projectInspection(inspection('api', {
            state: { status: 'running', oomKilled: false, exitCode }, restartCount: 1_000_000,
            health: { status: 'healthy', failingStreak: 0, probes: [{ exitCode }] },
        }), 'api', checkoutRoot)
        assert.equal(projected.exitCode, exitCode)
        assert.equal(projected.restartCount, 1_000_000)
        assert.equal(projected.failingStreak, 0)
        assert.equal(projected.oomKilled, false)
        assert.deepEqual(projected.probes, [{ exitCode }])
    }
})

test('malformed required inspection values produce a closed unavailable result', () => {
    for (const value of [null, [], secret, {}, inspection('api', { state: null }),
        inspection('api', { state: { status: false } }), inspection('api', { health: [] }),
        inspection('api', { health: {} }), inspection('api', { project: null }),
        inspection('api', { configFiles: [secret] })]) {
        assert.deepEqual(projectInspection(value, 'api', checkoutRoot), {
            result: 'unavailable', reason: 'invalid-data', state: 'unknown', health: 'unknown',
        })
    }
})

test('probe timestamps validate real calendar values and normalize supported Docker times', () => {
    const invalidTimes = [
        '2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-09-14T24:00:00Z',
        '2026-09-14T10:60:00Z', '2026-09-14T10:00:60Z', '0001-01-01T00:00:00Z',
        '2026-09-14', 1_789_380_000_000, null, secret,
    ]
    for (const value of invalidTimes) {
        const projected = projectInspection(inspection('api', {
            health: { status: 'healthy', probes: [{ start: value, end: value, exitCode: 0 }] },
        }), 'api', checkoutRoot)
        assert.deepEqual(projected.probes, [{ exitCode: 0 }])
    }
    const projected = projectInspection(inspection('api', {
        health: { status: 'healthy', probes: [null, [], secret, {
            start: '2026-09-14T12:00:00.123456789+02:00', end: '2026-09-14T10:00:01Z', exitCode: 0,
        }] },
    }), 'api', checkoutRoot)
    assert.deepEqual(projected.probes, [{
        start: Date.parse('2026-09-14T10:00:00.123Z'), end: Date.parse('2026-09-14T10:00:01Z'), exitCode: 0,
    }])
})

test('log samples count lines containing exact markers and discard all source text', () => {
    const sample = summarizeStartupLogs([
        `${secret} ECONNREFUSED ECONNREFUSED ETIMEDOUT ${secret}`,
        `ENOTFOUND OutOfMemoryError ${secret}`,
        `Unable to connect to the database Failed to start server ${secret}`,
        `econnrefused outofmemoryerror PASSWORD=${secret}`,
        '',
    ].join('\n'))
    assert.deepEqual(sample, {
        sampledLines: 4,
        markers: Object.fromEntries(markerNames.map(name => [name, 1])),
    })
    assert.deepEqual(summarizeStartupLogs(''), {
        sampledLines: 0,
        markers: Object.fromEntries(markerNames.map(name => [name, 0])),
    })
    const large = summarizeStartupLogs(Array.from({ length: 250 }, (_, index) => index < 50 ? 'ENOTFOUND' : `ECONNREFUSED ${secret}`).join('\n'))
    assert.equal(large.sampledLines, 200)
    assert.equal(large.markers['connection-refused'], 200)
    assert.equal(large.markers['name-resolution'], 0)
    assert.ok(!JSON.stringify(large).includes(secret))
})

test('collection visits the fixed services in priority order using bounded read-only commands', async () => {
    assert.deepEqual(SERVICES, expectedServices)
    const adapter = fakeAdapter()
    const result = await collectDiagnostics({ checkoutRoot, ...adapter, now: () => 0 })
    assertClosedEnvelope(result)
    assert.equal(result.collectionStatus, 'complete')
    assert.ok(Object.values(result.services).every(record => record.result === 'collected'))
    const discovery = adapter.calls.filter(({ args }) => args[0] === 'ps')
    assert.deepEqual(discovery.map(({ args }) => args.find(arg => arg.startsWith('label=com.docker.compose.service=')).split('=').at(-1)), expectedServices)
    for (const { args, options } of adapter.calls) {
        assert.equal(options.cwd, checkoutRoot)
        assert.ok(options.timeout > 0 && options.timeout <= 5_000)
        assert.ok(options.maxBuffer > 0 && options.maxBuffer <= 65_536)
        if (args[0] === 'ps') {
            assert.ok(args.includes('label=com.docker.compose.project=lef'))
            assert.ok(args.includes('--all') || args.includes('-a'))
        }
        if (args[0] === 'inspect') {
            assert.ok(args.some(arg => arg === '--format' || arg.startsWith('--format=')))
            const format = args.find(arg => arg.includes('{{'))
            assert.ok(format)
            assert.ok(!format.includes('.Output'))
            assert.ok(!format.includes('.Env'))
            assert.doesNotMatch(format, /json\s+\.(?:State|Config)(?:\s|})/)
        }
    }
    const logs = adapter.calls.filter(({ args }) => args[0] === 'logs')
    assert.deepEqual(logs.map(({ args }) => args.at(-1)), [idFor('keycloak'), idFor('api')])
    for (const { args } of logs) assert.ok(args.includes('200') || args.includes('--tail=200'))
    assert.equal(result.services.postgres.startupSample, undefined)
})

test('foreign ownership is rejected before logs are read', async () => {
    for (const changed of [
        { project: secret }, { service: 'api' }, { workingDir: `/foreign/${secret}` },
        { workingDir: `${checkoutRoot}/docker/..` },
        { configFiles: `${checkoutRoot}/docker/compose.yaml,/${secret}.yaml` },
        { configFiles: `/foreign/${secret}/docker/compose.yaml` },
    ]) {
        const adapter = fakeAdapter({ keycloak: { inspect: { ok: true, stdout: JSON.stringify(inspection('keycloak', changed)) } } })
        const result = await collectDiagnostics({ checkoutRoot, ...adapter })
        assertClosedEnvelope(result)
        assert.deepEqual(result.services.keycloak, { result: 'foreign', state: 'unknown', health: 'unknown' })
        assert.equal(result.collectionStatus, 'partial')
        assert.ok(!adapter.calls.some(({ args }) => args[0] === 'logs' && args.includes(idFor('keycloak'))))
        assert.equal(result.services.api.result, 'collected')
    }
})

test('missing, ambiguous, and malformed discovery never inspect or read logs', async () => {
    for (const [stdout, expected] of [
        ['', 'missing'], [`${idFor('keycloak')}\n${idFor('api')}\n`, 'ambiguous'],
        [`${idFor('keycloak')}\n${idFor('keycloak')}\n`, 'ambiguous'],
        [`${secret}\n`, 'unavailable'], [`${idFor('keycloak')} ${secret}\n`, 'unavailable'],
    ]) {
        const adapter = fakeAdapter({ keycloak: { ps: { ok: true, stdout } } })
        const result = await collectDiagnostics({ checkoutRoot, ...adapter })
        assertClosedEnvelope(result)
        assert.equal(result.services.keycloak.result, expected)
        if (expected === 'unavailable') assert.equal(result.services.keycloak.reason, 'invalid-data')
        assert.ok(!adapter.calls.some(({ args }) => ['inspect', 'logs'].includes(args[0]) && args.includes(idFor('keycloak'))))
    }
})

test('partial Docker failures retain other services and never forward untrusted error data', async () => {
    for (const reason of ['timeout', 'output-limit', 'command-failed', 'invalid-data']) {
        const adapter = fakeAdapter({ keycloak: { inspect: { ok: false, reason, stdout: secret, stderr: secret, error: secret } } })
        const result = await collectDiagnostics({ checkoutRoot, ...adapter })
        assertClosedEnvelope(result)
        assert.deepEqual(result.services.keycloak, { result: 'unavailable', reason, state: 'unknown', health: 'unknown' })
        assert.equal(result.services.api.result, 'collected')
        assert.equal(result.collectionStatus, 'partial')
    }
    for (const response of [
        { ok: true, stdout: `{${secret}` },
        { ok: true, stdout: '[]' },
        { ok: false, reason: secret },
        () => { throw new Error(secret) },
    ]) {
        const adapter = fakeAdapter({ keycloak: { inspect: response } })
        const result = await collectDiagnostics({ checkoutRoot, ...adapter })
        assertClosedEnvelope(result)
        assert.equal(result.services.keycloak.result, 'unavailable')
        assert.equal(result.services.api.result, 'collected')
    }
})

test('log failure preserves collected metadata and explicitly marks a partial collection', async () => {
    const adapter = fakeAdapter({ keycloak: { logs: { ok: false, reason: 'output-limit', stdout: secret, stderr: secret } } })
    const result = await collectDiagnostics({ checkoutRoot, ...adapter })
    assertClosedEnvelope(result)
    assert.equal(result.collectionStatus, 'partial')
    assert.equal(result.services.keycloak.result, 'collected')
    assert.equal(result.services.keycloak.state, 'exited')
    assert.equal(result.services.keycloak.oomKilled, true)
    assert.equal(result.services.keycloak.reason, 'output-limit')
    assert.equal(result.services.keycloak.startupSample, undefined)
})

test('the global deadline clips command timeouts and preserves Keycloak/API priority', async () => {
    let elapsed = 0
    const adapter = fakeAdapter()
    const runCommand = async (args, options) => {
        const response = await adapter.runCommand(args, options)
        elapsed += options.timeout
        return response
    }
    const result = await collectDiagnostics({ checkoutRoot, runCommand, now: () => elapsed })
    assertClosedEnvelope(result)
    assert.equal(result.collectionStatus, 'partial')
    assert.ok(elapsed < 45_000, 'collection reserves time to emit its summary')
    assert.ok(adapter.calls.some(({ options }) => options.timeout < 5_000))
    assert.equal(result.services.keycloak.result, 'collected')
    assert.equal(result.services.api.result, 'collected')
    assert.deepEqual(adapter.calls.slice(0, 6).map(({ args }) => args[0]), ['ps', 'inspect', 'logs', 'ps', 'inspect', 'logs'])
    for (const service of ['postgres', 'redis', 'garage', 'web', 'bullboard']) {
        assert.deepEqual(result.services[service], { result: 'unavailable', reason: 'timeout', state: 'unknown', health: 'unknown' })
    }
})

test('the real Docker CLI evaluates the safe inspection format against an isolated mock daemon', async context => {
    const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5_000 })
    if (docker.error?.code === 'ENOENT') {
        context.skip('Docker CLI is not installed; projection and fake CLI coverage still run')
        return
    }
    assert.equal(docker.status, 0, 'the installed Docker CLI must be executable')
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-diagnostics-daemon-test-'))
    const socketPath = resolve(directory, 'docker.sock')
    const requests = []
    const projectedInspections = []
    const server = createServer((request, response) => {
        requests.push({ method: request.method, url: request.url })
        if (request.url.endsWith('/_ping')) {
            response.writeHead(200, { 'Api-Version': '1.44' })
            response.end('OK')
            return
        }
        const service = ['keycloak', 'api'].find(name => request.url.endsWith(`/containers/${idFor(name)}/json`))
        response.setHeader('Content-Type', 'application/json')
        if (!service || request.method !== 'GET') {
            response.writeHead(404)
            response.end(JSON.stringify({ message: 'Unexpected mock request' }))
            return
        }
        response.end(JSON.stringify({
            Id: idFor(service),
            Config: {
                Labels: {
                    'com.docker.compose.project': 'lef',
                    'com.docker.compose.service': service,
                    'com.docker.compose.project.working_dir': resolve(checkoutRoot, 'docker'),
                    'com.docker.compose.project.config_files': resolve(checkoutRoot, 'docker/compose.yaml'),
                    unrelated: secret,
                },
                Env: [`PASSWORD=${secret}`],
                Healthcheck: { Test: ['CMD', secret] },
            },
            State: {
                Status: 'exited', OOMKilled: true, ExitCode: 137, Error: secret,
                ...(service === 'keycloak' ? { Health: {
                    Status: 'unhealthy', FailingStreak: 7,
                    Log: Array.from({ length: 7 }, (_, index) => ({
                        Start: `2026-09-14T10:00:0${index}.000Z`,
                        End: `2026-09-14T10:00:0${index}.500Z`,
                        ExitCode: index, Output: secret,
                    })),
                } } : {}),
            },
            RestartCount: 3,
        }))
    })
    try {
        await new Promise((resolveListening, reject) => {
            server.once('error', reject)
            server.listen(socketPath, resolveListening)
        })
        const execute = promisify(execFile)
        const runCommand = async (args, options) => {
            if (args[0] === 'ps') {
                const service = args.find(arg => arg.startsWith('label=com.docker.compose.service=')).split('=').at(-1)
                return { ok: true, stdout: ['keycloak', 'api'].includes(service) ? idFor(service) : '' }
            }
            if (args[0] === 'logs') return { ok: true, stdout: '' }
            assert.equal(args[0], 'inspect')
            const { stdout, stderr } = await execute('docker', ['--host', `unix://${socketPath}`, ...args], {
                ...options,
                encoding: 'utf8',
                env: { ...process.env, DOCKER_API_VERSION: '1.44', DOCKER_CONTEXT: undefined },
            })
            assert.equal(stderr, '')
            assert.ok(!stdout.includes(secret), 'the Docker template must exclude secret fields before projection')
            projectedInspections.push(JSON.parse(stdout))
            return { ok: true, stdout }
        }
        const result = await collectDiagnostics({ checkoutRoot, runCommand })
        assertClosedEnvelope(result)
        assert.equal(result.services.keycloak.result, 'collected')
        assert.equal(result.services.keycloak.oomKilled, true)
        assert.equal(result.services.keycloak.exitCode, 137)
        assert.equal(result.services.keycloak.restartCount, 3)
        assert.equal(result.services.keycloak.health, 'unhealthy')
        assert.deepEqual(result.services.keycloak.probes.map(probe => probe.exitCode), [2, 3, 4, 5, 6])
        assert.equal(result.services.api.result, 'collected')
        assert.equal(result.services.api.health, 'none')
        assert.equal(projectedInspections.length, 2)
        assert.equal(projectedInspections[0].health.probes.length, 5)
        assert.deepEqual(Object.keys(projectedInspections[0].health.probes[0]).sort(), ['end', 'exitCode', 'start'])
        assert.equal(projectedInspections[1].health, null)
        assert.equal(requests.filter(request => request.url.includes('/containers/')).length, 2)
    } finally {
        server.closeAllConnections()
        await new Promise(resolveClosed => server.close(resolveClosed))
        rmSync(directory, { recursive: true, force: true })
    }
})

function snapshotFiles(directory, relative = '') {
    return readdirSync(resolve(directory, relative), { withFileTypes: true }).flatMap(entry => {
        const name = relative ? `${relative}/${entry.name}` : entry.name
        return entry.isDirectory() ? snapshotFiles(directory, name) : [[name, readFileSync(resolve(directory, name), 'utf8')]]
    })
}

function runFakeDockerCli(scenario, timeout = 15_000) {
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-diagnostics-test-'))
    const fixtureCheckout = resolve(directory, 'checkout')
    const scriptDirectory = resolve(fixtureCheckout, 'scripts/testing')
    mkdirSync(scriptDirectory, { recursive: true })
    copyFileSync(resolve(import.meta.dirname, 'dev-stack-diagnostics.mjs'), resolve(scriptDirectory, 'dev-stack-diagnostics.mjs'))
    const dockerPath = resolve(directory, 'docker')
    writeFileSync(dockerPath, `#!${process.execPath}
const args = process.argv.slice(2);
const services = ${JSON.stringify(expectedServices)};
const secret = ${JSON.stringify(secret)};
const scenario = process.env.DIAGNOSTIC_TEST_SCENARIO;
const serviceFilter = args.find(arg => arg.startsWith('label=com.docker.compose.service='));
const service = serviceFilter ? serviceFilter.split('=').at(-1) : services[Number(args.at(-1)[0]) - 1];
if (service === 'keycloak' && scenario === 'timeout') {
    process.stdout.write(secret);
    process.stderr.write(secret);
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
} else if (service === 'keycloak' && scenario === 'stdout-limit') {
    process.stdout.write(secret.repeat(10000));
} else if (service === 'keycloak' && scenario === 'stderr-limit') {
    process.stderr.write(secret.repeat(10000));
} else if (service === 'keycloak' && scenario === 'command-failed') {
    process.stdout.write(secret);
    process.stderr.write(secret);
    process.exitCode = 72;
} else if (args[0] === 'ps') {
    process.stderr.write(secret);
    process.stdout.write(String(services.indexOf(service) + 1).repeat(64) + '\\n');
} else if (args[0] === 'inspect') {
    process.stderr.write(scenario === 'combined-inspection-limit' && service === 'keycloak' ? secret.repeat(1100) : secret);
    process.stdout.write(JSON.stringify({
        project: 'lef', service,
        workingDir: process.env.DIAGNOSTIC_TEST_CHECKOUT + '/docker',
        configFiles: process.env.DIAGNOSTIC_TEST_CHECKOUT + '/docker/compose.yaml',
        state: { status: 'exited', oomKilled: true, exitCode: 137, error: secret },
        restartCount: 5,
        health: { status: 'unhealthy', failingStreak: 2,
            probes: [{ start: '2026-09-14T10:00:00Z', end: '2026-09-14T10:00:01Z', exitCode: 1, Output: secret }] },
        Config: { Env: ['PASSWORD=' + secret] },
    }));
    if (scenario === 'combined-inspection-limit' && service === 'keycloak') process.stdout.write(' '.repeat(40000));
} else if (args[0] === 'logs') {
    if (scenario === 'combined-limit') {
        process.stdout.write(secret.repeat(1100));
        process.stderr.write(secret.repeat(1100));
    } else {
        process.stdout.write(secret + ' ECONNREFUSED ' + secret + '\\n');
        process.stderr.write(secret + ' OutOfMemoryError ' + secret + '\\n');
    }
} else {
    process.stderr.write(secret);
    process.exitCode = 73;
}
`, { mode: 0o700 })
    const before = snapshotFiles(directory)
    chmodSync(scriptDirectory, 0o555)
    chmodSync(resolve(fixtureCheckout, 'scripts'), 0o555)
    chmodSync(fixtureCheckout, 0o555)
    try {
        const started = performance.now()
        const result = spawnSync(process.execPath, [resolve(scriptDirectory, 'dev-stack-diagnostics.mjs')], {
            cwd: directory,
            encoding: 'utf8',
            timeout,
            maxBuffer: 65_536,
            env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                DIAGNOSTIC_TEST_SCENARIO: scenario,
                DIAGNOSTIC_TEST_CHECKOUT: fixtureCheckout,
                COMPOSE_PROJECT_NAME: 'foreign-project',
            },
        })
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stderr, '')
        assert.ok(Buffer.byteLength(result.stdout) <= 32_768)
        assert.ok(!result.stdout.includes(secret))
        assert.ok(!result.stdout.includes(fixtureCheckout))
        assert.deepEqual(snapshotFiles(directory), before, 'collector creates and modifies no files')
        const envelope = JSON.parse(result.stdout)
        assertClosedEnvelope(envelope)
        return { envelope, elapsed: performance.now() - started }
    } finally {
        chmodSync(fixtureCheckout, 0o755)
        chmodSync(resolve(fixtureCheckout, 'scripts'), 0o755)
        chmodSync(scriptDirectory, 0o755)
        rmSync(directory, { recursive: true, force: true })
    }
}

test('the actual CLI emits strict safe JSON from a read-only checkout and handles Docker log stderr', () => {
    const { envelope } = runFakeDockerCli('healthy')
    assert.equal(envelope.collectionStatus, 'complete')
    for (const service of ['keycloak', 'api']) {
        assert.equal(envelope.services[service].startupSample.markers['connection-refused'], 1)
        assert.equal(envelope.services[service].startupSample.markers['memory-error'], 1)
    }
})

for (const [scenario, reason] of [
    ['stdout-limit', 'output-limit'], ['stderr-limit', 'output-limit'], ['command-failed', 'command-failed'],
    ['combined-inspection-limit', 'output-limit'],
]) {
    test(`the actual CLI discards poisoned ${scenario} output and continues other services`, () => {
        const { envelope } = runFakeDockerCli(scenario)
        assert.equal(envelope.collectionStatus, 'partial')
        assert.equal(envelope.services.keycloak.result, 'unavailable')
        assert.equal(envelope.services.keycloak.reason, reason)
        assert.equal(envelope.services.api.result, 'collected')
    })
}

test('the actual CLI bounds combined stdout and stderr log output', () => {
    const { envelope } = runFakeDockerCli('combined-limit')
    assert.equal(envelope.collectionStatus, 'partial')
    assert.equal(envelope.services.keycloak.result, 'collected')
    assert.equal(envelope.services.keycloak.reason, 'output-limit')
    assert.equal(envelope.services.keycloak.startupSample, undefined)
})

test('the actual CLI kills a timed-out Docker child and discards its partial output', () => {
    const { envelope, elapsed } = runFakeDockerCli('timeout')
    assert.equal(envelope.collectionStatus, 'partial')
    assert.equal(envelope.services.keycloak.reason, 'timeout')
    assert.equal(envelope.services.api.result, 'collected')
    assert.ok(elapsed >= 4_500)
    assert.ok(elapsed < 12_000)
})
