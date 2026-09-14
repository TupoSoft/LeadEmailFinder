import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { collectDiagnostics, serializeDiagnostics } from './dev-stack-diagnostics.mjs'

const checkoutRoot = resolve(import.meta.dirname, '../..')
const fixtureRoot = '/synthetic/checkout'
const services = ['keycloak', 'api', 'keycloak-postgres', 'postgres', 'redis', 'garage', 'web', 'bullboard']
const markerNames = [
    'connection-refused',
    'connection-timeout',
    'name-resolution',
    'memory-error',
    'database-retry',
    'startup-failed',
]
const poison = 'synthetic-secret-cookie-user@example.invalid-token-DO-NOT-EMIT'

function markers(values = {}) {
    return Object.fromEntries(markerNames.map(name => [name, values[name] ?? 0]))
}

function containerId(service) {
    return (services.indexOf(service) + 1).toString(16).repeat(64)
}

function inspection(service, overrides = {}, root = fixtureRoot) {
    return {
        project: 'lef',
        service,
        workingDirectory: `${root}/docker`,
        configFiles: `${root}/docker/compose.yaml`,
        state: 'running',
        health: 'healthy',
        oomKilled: false,
        restartCount: 2,
        exitCode: 0,
        failingStreak: 0,
        probes: [{ start: '2026-09-14T12:00:00.123456789Z', end: '2026-09-14T12:00:01Z', exitCode: 0 }],
        ...overrides,
    }
}

function successful(stdout = '', stderr = '') {
    return { status: 0, stdout, stderr }
}

function commandService(args) {
    if (args[0] === 'ps') {
        return args
            .find(value => value.startsWith('label=com.docker.compose.service='))
            .split('=')
            .at(-1)
    }
    return services.find(service => containerId(service) === args.at(-1))
}

function collectWith({ inspect = {}, outputs = {}, command, now = () => 0 } = {}) {
    const calls = []
    const summary = collectDiagnostics({
        checkoutRoot: fixtureRoot,
        now,
        runCommand(args, options) {
            const service = commandService(args)
            calls.push({ args, options, service })
            const overridden = command?.({ args, options, service })
            if (overridden !== undefined) return overridden
            if (args[0] === 'ps') return successful(`${containerId(service)}\n`)
            if (args[0] === 'inspect') return successful(JSON.stringify(inspection(service, inspect[service])))
            return outputs[service] ?? successful('')
        },
    })
    return { summary, calls }
}

function assertClosedEnvelope(summary) {
    assert.deepEqual(Object.keys(summary).sort(), ['collectionStatus', 'schemaVersion', 'services'])
    assert.equal(summary.schemaVersion, 1)
    assert.ok(['complete', 'partial'].includes(summary.collectionStatus))
    assert.deepEqual(Object.keys(summary.services), services)
    for (const record of Object.values(summary.services)) {
        assert.ok(['collected', 'missing', 'ambiguous', 'foreign', 'unavailable'].includes(record.result))
        assert.ok(
            ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'unknown'].includes(
                record.state,
            ),
        )
        assert.ok(['starting', 'healthy', 'unhealthy', 'none', 'unknown'].includes(record.health))
        for (const key of Object.keys(record)) {
            assert.ok(
                [
                    'result',
                    'reason',
                    'state',
                    'health',
                    'oomKilled',
                    'restartCount',
                    'exitCode',
                    'failingStreak',
                    'probes',
                    'startupSample',
                ].includes(key),
                `Unexpected record field: ${key}`,
            )
        }
        if (record.reason !== undefined) {
            assert.ok(['timeout', 'output-limit', 'command-failed', 'invalid-data'].includes(record.reason))
        }
    }
    const output = serializeDiagnostics(summary)
    assert.deepEqual(JSON.parse(output), summary)
    assert.ok(Buffer.byteLength(output) <= 32_768)
    assert.ok(!output.includes(poison))
}

test('owned services produce a closed summary and inspect only explicit safe fields', () => {
    const { summary, calls } = collectWith()
    assertClosedEnvelope(summary)
    assert.equal(summary.collectionStatus, 'complete')
    for (const service of services) {
        assert.deepEqual(summary.services[service], {
            result: 'collected',
            state: 'running',
            health: 'healthy',
            oomKilled: false,
            restartCount: 2,
            exitCode: 0,
            failingStreak: 0,
            probes: [{ start: 1_789_387_200_123, end: 1_789_387_201_000, exitCode: 0 }],
            ...(['keycloak', 'api'].includes(service)
                ? { startupSample: { sampledLines: 0, markers: markers() } }
                : {}),
        })
    }
    assert.deepEqual(
        calls.filter(call => call.args[0] === 'ps').map(call => call.service),
        services,
    )
    for (const { args, options } of calls) {
        assert.equal(options.cwd, fixtureRoot)
        assert.ok(options.timeout > 0 && options.timeout <= 5_000)
        assert.equal(options.maxBuffer, 65_536)
        if (args[0] === 'ps') {
            assert.ok(args.includes('--all'))
            assert.ok(args.includes('--no-trunc'))
            assert.ok(args.includes('label=com.docker.compose.project=lef'))
        }
        if (args[0] === 'inspect') {
            const format = args[args.indexOf('--format') + 1]
            assert.ok(format)
            assert.doesNotMatch(format, /\.Output|\.Error|\.Env|json\s+\.(?:State|Config)(?:\s|})|json\s+\.(?:\s|})/)
        }
    }
    assert.deepEqual(
        calls.filter(call => call.args[0] === 'logs').map(call => call.service),
        ['keycloak', 'api'],
    )
})

test('stopped containers and every Docker state remain diagnosable', () => {
    const states = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'future-state']
    const health = ['starting', 'healthy', 'unhealthy', 'none', 'future-health', 'none', 'none', 'none']
    const inspect = Object.fromEntries(
        services.map((service, index) => [
            service,
            {
                state: states[index],
                health: health[index],
                oomKilled: true,
                exitCode: 137,
            },
        ]),
    )
    const { summary } = collectWith({ inspect })
    assertClosedEnvelope(summary)
    for (const [index, service] of services.entries()) {
        const record = summary.services[service]
        assert.equal(record.result, 'collected')
        assert.equal(record.state, index === 7 ? 'unknown' : states[index])
        assert.equal(record.health, index === 4 ? 'unknown' : health[index])
        assert.equal(record.oomKilled, true)
        assert.equal(record.exitCode, 137)
    }
})

test('ownership checks require exact labels before reading logs', () => {
    for (const overrides of [
        { project: poison },
        { service: poison },
        { workingDirectory: '/another/checkout' },
        { workingDirectory: `${fixtureRoot}/docker/..` },
        { configFiles: `${fixtureRoot}/docker/compose.yaml,${poison}` },
        { configFiles: `${fixtureRoot}/docker/../docker/compose.yaml` },
    ]) {
        const { summary, calls } = collectWith({ inspect: { keycloak: overrides } })
        assert.deepEqual(summary.services.keycloak, { result: 'foreign', state: 'unknown', health: 'unknown' })
        assert.equal(summary.collectionStatus, 'partial')
        assert.ok(!calls.some(call => call.service === 'keycloak' && call.args[0] === 'logs'))
        assertClosedEnvelope(summary)
    }
    const { summary } = collectWith({ inspect: { keycloak: { workingDirectory: fixtureRoot } } })
    assert.equal(summary.services.keycloak.result, 'collected')
})

test('missing, ambiguous, and malformed discovery never inspect or read logs', () => {
    for (const [stdout, result, reason] of [
        ['', 'missing', undefined],
        [`${containerId('keycloak')}\n${containerId('api')}\n`, 'ambiguous', undefined],
        [`${containerId('keycloak')}\n${containerId('keycloak')}\n`, 'ambiguous', undefined],
        [poison, 'unavailable', 'invalid-data'],
    ]) {
        const { summary, calls } = collectWith({
            command: ({ args, service }) =>
                service === 'keycloak' && args[0] === 'ps' ? successful(stdout) : undefined,
        })
        assert.deepEqual(summary.services.keycloak, {
            result,
            state: 'unknown',
            health: 'unknown',
            ...(reason ? { reason } : {}),
        })
        assert.deepEqual(
            calls.filter(call => call.service === 'keycloak').map(call => call.args[0]),
            ['ps'],
        )
        assertClosedEnvelope(summary)
    }
})

test('malformed inspection fails closed without exposing values or stopping other services', () => {
    for (const stdout of [
        poison,
        'null',
        '[]',
        'true',
        JSON.stringify({ ...inspection('keycloak'), state: 7 }),
        JSON.stringify({ ...inspection('keycloak'), project: undefined }),
    ]) {
        const { summary, calls } = collectWith({
            command: ({ args, service }) =>
                service === 'keycloak' && args[0] === 'inspect' ? successful(stdout) : undefined,
        })
        assert.deepEqual(summary.services.keycloak, {
            result: 'unavailable',
            reason: 'invalid-data',
            state: 'unknown',
            health: 'unknown',
        })
        assert.equal(summary.services.api.result, 'collected')
        assert.ok(!calls.some(call => call.service === 'keycloak' && call.args[0] === 'logs'))
        assertClosedEnvelope(summary)
    }
})

test('only bounded optional facts and the latest five probes survive projection', () => {
    const probes = Array.from({ length: 8 }, (_, index) => ({
        start: `2026-09-14T12:00:0${index}Z`,
        end: `2026-09-14T12:00:0${index}.500Z`,
        exitCode: index,
        Output: poison,
        environment: poison,
    }))
    probes[4] = { start: poison, end: null, exitCode: 256, Output: poison }
    const { summary } = collectWith({
        inspect: {
            keycloak: {
                oomKilled: poison,
                restartCount: 1_000_001,
                exitCode: -2,
                failingStreak: 2.5,
                probes,
                Config: { Env: [poison] },
                error: poison,
            },
        },
    })
    const record = summary.services.keycloak
    for (const field of ['oomKilled', 'restartCount', 'exitCode', 'failingStreak']) assert.ok(!(field in record))
    assert.deepEqual(
        record.probes,
        [3, 5, 6, 7].map(index => ({
            start: 1_789_387_200_000 + index * 1_000,
            end: 1_789_387_200_500 + index * 1_000,
            exitCode: index,
        })),
    )
    assertClosedEnvelope(summary)
    const boundary = collectWith({
        inspect: {
            keycloak: {
                restartCount: 1_000_000,
                exitCode: -1,
                failingStreak: 1_000_000,
                probes: [{ exitCode: -1 }, { exitCode: 255 }, { exitCode: 256 }],
            },
        },
    }).summary.services.keycloak
    assert.equal(boundary.restartCount, 1_000_000)
    assert.equal(boundary.failingStreak, 1_000_000)
    assert.equal(boundary.exitCode, -1)
    assert.deepEqual(boundary.probes, [{ exitCode: -1 }, { exitCode: 255 }])
})

test('startup samples count exact markers on stdout and stderr without copying raw lines', () => {
    const { summary } = collectWith({
        outputs: {
            keycloak: successful(
                `${poison} ECONNREFUSED ECONNREFUSED ETIMEDOUT ${poison}\n${poison} ENOTFOUND\n`,
                `${poison} OutOfMemoryError\n${poison} Unable to connect to the database Failed to start server ${poison}\n`,
            ),
            api: successful(`PASSWORD=${poison}\neconnrefused\nUnable to connect to The database\n`),
        },
    })
    assert.deepEqual(summary.services.keycloak.startupSample, {
        sampledLines: 4,
        markers: Object.fromEntries(markerNames.map(name => [name, 1])),
    })
    assert.deepEqual(summary.services.api.startupSample, { sampledLines: 3, markers: markers() })
    assertClosedEnvelope(summary)
})

test('probe timestamps require real calendar dates and become numeric epoch milliseconds', () => {
    const { summary } = collectWith({
        inspect: {
            keycloak: {
                probes: [
                    { start: '2026-02-30T12:00:00Z', end: '2026-09-14T24:00:00Z', exitCode: 1 },
                    { start: '2026-09-14', end: '2026-09-14T12:00:00+24:00', exitCode: 2 },
                    { start: 1_789_387_200_000, end: '2026-09-14T12:00:60Z', exitCode: 3 },
                    { start: '2026-09-14T14:00:00+02:00', end: '2026-09-14T07:00:00-05:00', exitCode: 0 },
                ],
            },
        },
    })
    assert.deepEqual(summary.services.keycloak.probes, [
        { exitCode: 1 },
        { exitCode: 2 },
        { exitCode: 3 },
        { start: 1_789_387_200_000, end: 1_789_387_200_000, exitCode: 0 },
    ])
    assertClosedEnvelope(summary)
})

test('startup samples retain at most the last 200 lines and count each marker once per line', () => {
    const logs = ['OutOfMemoryError', ...Array.from({ length: 200 }, () => `${poison} ECONNREFUSED ECONNREFUSED`)]
    const { summary } = collectWith({ outputs: { keycloak: successful(`${logs.join('\n')}\n`) } })
    assert.deepEqual(summary.services.keycloak.startupSample, {
        sampledLines: 200,
        markers: markers({ 'connection-refused': 200 }),
    })
    assertClosedEnvelope(summary)
})

test('child failures discard poisoned partial output and keep collecting independent services', () => {
    for (const [failure, reason] of [
        [{ status: 1 }, 'command-failed'],
        [{ status: null, signal: 'SIGKILL' }, 'command-failed'],
        [{ status: null, error: { code: 'ETIMEDOUT', message: poison } }, 'timeout'],
        [{ status: null, error: { code: 'ENOBUFS', message: poison } }, 'output-limit'],
    ]) {
        const { summary } = collectWith({
            command: ({ args, service }) => {
                if (service === 'keycloak' && args[0] === 'inspect') {
                    return { stdout: JSON.stringify(inspection(service)), stderr: poison, ...failure }
                }
            },
        })
        assert.deepEqual(summary.services.keycloak, {
            result: 'unavailable',
            reason,
            state: 'unknown',
            health: 'unknown',
        })
        assert.equal(summary.services.api.result, 'collected')
        assertClosedEnvelope(summary)
    }
    const { summary } = collectWith({
        command: ({ service }) => {
            if (service === 'keycloak') throw new Error(poison)
        },
    })
    assert.equal(summary.services.keycloak.reason, 'command-failed')
    assert.equal(summary.services.api.result, 'collected')
    assertClosedEnvelope(summary)
})

test('a startup log failure retains safe inspected facts and omits the partial sample', () => {
    const { summary } = collectWith({
        outputs: {
            keycloak: { status: 1, stdout: `${poison} ECONNREFUSED`, stderr: poison },
        },
    })
    assert.equal(summary.collectionStatus, 'partial')
    const record = summary.services.keycloak
    assert.equal(record.result, 'unavailable')
    assert.equal(record.reason, 'command-failed')
    assert.equal(record.state, 'running')
    assert.equal(record.restartCount, 2)
    assert.ok(!('startupSample' in record))
    assertClosedEnvelope(summary)
})

test('combined output bytes are bounded even when neither stream exceeds the limit alone', () => {
    for (const output of [
        successful('x'.repeat(65_537)),
        successful('', 'x'.repeat(65_537)),
        successful('x'.repeat(32_769), 'x'.repeat(32_768)),
        successful('é'.repeat(32_769)),
    ]) {
        const { summary } = collectWith({ outputs: { keycloak: output } })
        assert.equal(summary.services.keycloak.reason, 'output-limit')
        assert.ok(!summary.services.keycloak.startupSample)
        assertClosedEnvelope(summary)
    }
})

test('the output boundary discards unknown fields, raw strings, and custom JSON serializers', () => {
    const { summary } = collectWith()
    summary.rawOutput = poison
    summary.toJSON = () => ({ leaked: poison })
    summary.services.foreign = { secret: poison }
    summary.services.keycloak.unknownField = poison
    summary.services.keycloak.toJSON = () => ({ leaked: poison })
    summary.services.keycloak.probes[0].Output = poison
    summary.services.keycloak.startupSample.markers[poison] = 50
    summary.services.keycloak.startupSample.markers['connection-refused'] = 201
    summary.services.api.state = poison
    summary.services.api.health = poison
    summary.services.redis.startupSample = { sampledLines: 1, markers: markers() }
    const output = serializeDiagnostics(summary)
    assert.ok(!output.includes(poison))
    const sanitized = JSON.parse(output)
    assertClosedEnvelope(sanitized)
    assert.equal(sanitized.services.api.state, 'unknown')
    assert.equal(sanitized.services.api.health, 'unknown')
    assert.deepEqual(sanitized.services.keycloak.startupSample.markers, markers())
    assert.ok(!('startupSample' in sanitized.services.redis))
    assert.deepEqual(sanitized.services.keycloak.probes, [
        {
            start: 1_789_387_200_123,
            end: 1_789_387_201_000,
            exitCode: 0,
        },
    ])
})

test('the monotonic deadline prioritizes Keycloak and API, clips commands, and reserves summary time', () => {
    let elapsed = 0
    const { summary, calls } = collectWith({
        now: () => elapsed,
        command: ({ options }) => {
            elapsed += options.timeout
        },
    })
    assert.equal(elapsed, 44_900)
    assert.deepEqual(
        calls.slice(0, 6).map(call => call.service),
        ['keycloak', 'keycloak', 'keycloak', 'api', 'api', 'api'],
    )
    assert.equal(calls.length, 9)
    assert.equal(calls.at(-1).options.timeout, 4_900)
    assert.ok(calls.every(call => call.options.timeout <= 5_000))
    assert.equal(summary.services.keycloak.result, 'collected')
    assert.equal(summary.services.api.result, 'collected')
    for (const service of ['postgres', 'redis', 'garage', 'web', 'bullboard']) {
        assert.deepEqual(summary.services[service], {
            result: 'unavailable',
            reason: 'timeout',
            state: 'unknown',
            health: 'unknown',
        })
    }
    assert.equal(summary.collectionStatus, 'partial')
    assertClosedEnvelope(summary)
})

function runCli(scenario) {
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-diagnostic-test-'))
    const root = resolve(directory, 'checkout')
    const unrelatedCwd = resolve(directory, 'unrelated')
    mkdirSync(resolve(root, 'scripts/testing'), { recursive: true })
    mkdirSync(unrelatedCwd)
    copyFileSync(
        resolve(checkoutRoot, 'scripts/testing/dev-stack-diagnostics.mjs'),
        resolve(root, 'scripts/testing/dev-stack-diagnostics.mjs'),
    )
    const callsPath = resolve(directory, 'calls.jsonl')
    const fakeDocker = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const scenario = process.env.DIAGNOSTIC_TEST_SCENARIO;
const root = process.env.DIAGNOSTIC_TEST_ROOT;
const secret = ${JSON.stringify(poison)};
const services = ${JSON.stringify(services)};
const idFor = service => (services.indexOf(service) + 1).toString(16).repeat(64);
const service = args[0] === 'ps'
    ? args.find(value => value.startsWith('label=com.docker.compose.service=')).split('=').at(-1)
    : services.find(value => idFor(value) === args.at(-1));
appendFileSync(process.env.DIAGNOSTIC_TEST_CALLS, JSON.stringify({args,cwd:process.cwd(),service,pid:process.pid}) + '\\n');
if (service === 'keycloak' && args[0] === 'ps' && scenario === 'timeout') {
    process.on('SIGTERM', () => {});
    process.stderr.write(secret);
    setInterval(() => {}, 1000);
} else if (service === 'keycloak' && args[0] === 'inspect' && scenario === 'failure') {
    process.stdout.write(secret);
    process.stderr.write(secret);
    process.exitCode = 19;
} else if (service === 'keycloak' && args[0] === 'logs' && scenario === 'overflow') {
    process.stderr.write(secret + 'x'.repeat(100000));
} else if (scenario === 'timeout') {
    process.stdout.write('');
} else if (args[0] === 'ps') {
    process.stdout.write(idFor(service) + '\\n');
} else if (args[0] === 'inspect') {
    process.stdout.write(JSON.stringify({
        project:'lef', service, workingDirectory:root+'/docker', configFiles:root+'/docker/compose.yaml',
        state:'exited', health:'unhealthy', oomKilled:true, restartCount:3, exitCode:137, failingStreak:4,
        probes:[{start:'2026-09-14T12:00:00Z',end:'2026-09-14T12:00:01Z',exitCode:1,Output:secret}],
        Config:{Env:[secret]}, Error:secret,
    }));
} else if (args[0] === 'logs') {
    process.stdout.write(secret + ' ECONNREFUSED ' + secret + '\\n');
    process.stderr.write(secret + ' OutOfMemoryError ' + secret + '\\n');
}
`
    writeFileSync(resolve(directory, 'docker'), fakeDocker, { mode: 0o700 })
    try {
        const result = spawnSync(process.execPath, [resolve(root, 'scripts/testing/dev-stack-diagnostics.mjs')], {
            cwd: unrelatedCwd,
            encoding: 'utf8',
            timeout: 15_000,
            killSignal: 'SIGKILL',
            maxBuffer: 1_048_576,
            env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                COMPOSE_PROJECT_NAME: poison,
                DIAGNOSTIC_TEST_SCENARIO: scenario,
                DIAGNOSTIC_TEST_ROOT: root,
                DIAGNOSTIC_TEST_CALLS: callsPath,
            },
        })
        const calls = readFileSync(callsPath, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        assert.deepEqual(readdirSync(root, { recursive: true }).sort(), [
            'scripts',
            'scripts/testing',
            'scripts/testing/dev-stack-diagnostics.mjs',
        ])
        assert.deepEqual(readdirSync(unrelatedCwd), [])
        assert.deepEqual(readdirSync(directory).sort(), ['calls.jsonl', 'checkout', 'docker', 'unrelated'])
        return { ...result, calls, root }
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
}

test('the real CLI emits only strict sanitized JSON and resolves ownership from its script location', () => {
    const result = runCli('complete')
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.ok(!result.stdout.includes(poison))
    const summary = JSON.parse(result.stdout)
    assertClosedEnvelope(summary)
    assert.equal(summary.collectionStatus, 'complete')
    assert.equal(summary.services.keycloak.state, 'exited')
    assert.deepEqual(summary.services.keycloak.startupSample, {
        sampledLines: 2,
        markers: markers({ 'connection-refused': 1, 'memory-error': 1 }),
    })
    assert.ok(result.calls.every(call => call.cwd === result.root))
    assert.ok(
        result.calls
            .filter(call => call.args[0] === 'ps')
            .every(call => call.args.includes('label=com.docker.compose.project=lef')),
    )
})

test('real CLI child failure and excessive stderr never leak partial output', () => {
    for (const [scenario, reason] of [
        ['failure', 'command-failed'],
        ['overflow', 'output-limit'],
    ]) {
        const result = runCli(scenario)
        assert.equal(result.status, 0)
        assert.equal(result.stderr, '')
        assert.ok(!result.stdout.includes(poison))
        const summary = JSON.parse(result.stdout)
        assertClosedEnvelope(summary)
        assert.equal(summary.collectionStatus, 'partial')
        assert.equal(summary.services.keycloak.reason, reason)
        assert.equal(summary.services.api.result, 'collected')
    }
})

test('the real CLI kills a timed-out Docker process even when it ignores SIGTERM', () => {
    const started = performance.now()
    const result = runCli('timeout')
    const elapsed = performance.now() - started
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.ok(elapsed < 12_000, `CLI exceeded its child deadline: ${elapsed}ms`)
    const summary = JSON.parse(result.stdout)
    assertClosedEnvelope(summary)
    assert.equal(summary.services.keycloak.reason, 'timeout')
    assert.equal(summary.services.api.result, 'missing')
    const timedOutPid = result.calls.find(call => call.service === 'keycloak').pid
    assert.throws(() => process.kill(timedOutPid, 0), { code: 'ESRCH' })
})
